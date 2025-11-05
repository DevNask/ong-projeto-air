/* assets/js/app.js
   Projeto Air - app.js
   - SPA básico que carrega o <main> de outras páginas via fetch
   - Template engine mínimo (string templates + placeholders)
   - Manipulação do DOM (event delegation)
   - Validação/consistência do formulário de cadastro
   - Armazenamento local (localStorage) de cadastros
   - Lightbox simples para imagens de galeria
   - Funciona sem frameworks externos
*/

(() => {
  'use strict';

  /* ---------- Config ---------- */
  const STORAGE_KEY = 'projetoAir_submissions_v1';
  const ROOT_MAIN_SELECTOR = 'main'; // onde injetamos templates
  const NAV_SELECTOR = '.menu'; // delegação de cliques no menu
  const LINK_SELECTOR = 'a[href]'; // consider links com href

  /* ---------- Helpers ---------- */
  function qs(selector, root = document) { return root.querySelector(selector); }
  function qsa(selector, root = document) { return Array.from(root.querySelectorAll(selector)); }

  function showMessage(targetEl, message, type = 'info', timeout = 5000) {
    // cria um pequeno alerta inline (acessível)
    if (!targetEl) return;
    let box = document.createElement('div');
    box.className = `pa-message pa-${type}`;
    box.setAttribute('role', 'alert');
    box.textContent = message;
    targetEl.prepend(box);
    // remove depois de timeout
    setTimeout(() => {
      box.classList.add('pa-fadeout');
      setTimeout(() => box.remove(), 500);
    }, timeout);
  }

  function saveSubmission(data) {
    const arr = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    arr.push(Object.assign({createdAt: new Date().toISOString()}, data));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
  }

  function getSubmissions() {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  }

  /* ---------- Simple template function ----------
     supports templates like:
       "Olá, {{nome}}!"
     and templates in nodes using data-template attributes
  */
  function renderTemplate(str, ctx = {}) {
    return str.replace(/\{\{(.+?)\}\}/g, (_, key) => {
      key = key.trim();
      return (ctx[key] !== undefined && ctx[key] !== null) ? ctx[key] : '';
    });
  }

  /* ---------- SPA: fetch page and inject main ---------- */
  async function loadPage(url, push = true) {
    try {
      showLoadingState(true);
      // fetch the page
      const res = await fetch(url, {cache: 'no-store'});
      if (!res.ok) {
        throw new Error('Erro ao carregar a página');
      }
      const text = await res.text();
      // parse
      const parser = new DOMParser();
      const doc = parser.parseFromString(text, 'text/html');
      const newMain = doc.querySelector(ROOT_MAIN_SELECTOR);
      if (!newMain) {
        throw new Error('Conteúdo não encontrado na página');
      }
      const targetMain = qs(ROOT_MAIN_SELECTOR);
      if (!targetMain) return;
      // animate out/in
      targetMain.classList.add('pa-exit');
      await new Promise(r => setTimeout(r, 180));
      targetMain.innerHTML = newMain.innerHTML;
      targetMain.classList.remove('pa-exit');
      targetMain.classList.add('pa-enter');
      setTimeout(() => targetMain.classList.remove('pa-enter'), 350);

      // update document title if present
      const newTitle = doc.querySelector('title');
      if (newTitle) document.title = newTitle.textContent;

      // re-initialize behaviors for new content
      initDynamicFeatures(targetMain);

      if (push) history.pushState({spa: true, url}, '', url);
    } catch (err) {
      console.error(err);
      alert('Falha ao carregar a página. Verifique a URL ou o servidor (no modo local use HTTP).');
    } finally {
      showLoadingState(false);
    }
  }

  function showLoadingState(active) {
    // simple top bar / body class
    document.documentElement.classList.toggle('pa-loading', !!active);
  }

  /* ---------- Intercept link clicks (delegation) ---------- */
  function handleLinkClicks(e) {
    // only left clicks, without modifiers
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
    const a = e.target.closest(LINK_SELECTOR);
    if (!a) return;
    const href = a.getAttribute('href');
    if (!href) return;
    // only handle same-origin links and .html pages (progressive enhancement)
    const isHash = href.startsWith('#');
    const isExternal = a.host !== location.host;
    const isMailto = href.startsWith('mailto:') || href.startsWith('tel:');
    if (isHash || isExternal || isMailto) return;
    // we prefer to only intercept .html pages (index.html, projetos.html, cadastro.html)
    if (href.endsWith('.html') || href === '/' || href === '' || href.startsWith(location.pathname)) {
      e.preventDefault();
      loadPage(href);
    }
  }

  /* ---------- Validate form data (consistency rules) ---------- */
  function validateCadastroForm(formEl) {
    const errors = [];
    const get = id => (formEl.querySelector(`#${id}`) ? formEl.querySelector(`#id_${id}`) : null);

    // get values defensively (works even if IDs differ)
    const nomeEl = formEl.querySelector('#nome') || formEl.querySelector('input[name="nome"]');
    const emailEl = formEl.querySelector('#email') || formEl.querySelector('input[name="email"]');
    const contatoEl = formEl.querySelector('#contato') || formEl.querySelector('input[name="contato"]');
    const nascimentoEl = formEl.querySelector('#nascimento') || formEl.querySelector('input[name="nascimento"]');
    const ufEl = formEl.querySelector('#uf') || formEl.querySelector('select[name="uf"]');
    const formaEl = formEl.querySelector('#formaContribuicao') || formEl.querySelector('select[name="formaContribuicao"]');

    const nome = nomeEl ? nomeEl.value.trim() : '';
    const email = emailEl ? emailEl.value.trim() : '';
    const contato = contatoEl ? contatoEl.value.trim() : '';
    const nascimento = nascimentoEl ? nascimentoEl.value : '';
    const uf = ufEl ? ufEl.value : '';
    const forma = formaEl ? formaEl.value : '';

    // Nome
    if (!nome || nome.length < 3) {
      errors.push({field: nomeEl, message: 'Nome inválido. Informe pelo menos 3 caracteres.'});
    }
    // Email - regex simples
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRe.test(email)) {
      errors.push({field: emailEl, message: 'E-mail inválido.'});
    }
    // Contato - aceitaremos números e formatos com parênteses, traço e espaço
    const phoneDigits = contato.replace(/\D/g, '');
    if (!contato || phoneDigits.length < 10) {
      errors.push({field: contatoEl, message: 'Telefone inválido. Use DDD + número.'});
    }
    // Data de nascimento - checar maioridade mínima (por exemplo 12 anos)
    if (!nascimento) {
      errors.push({field: nascimentoEl, message: 'Informe a data de nascimento.'});
    } else {
      const dob = new Date(nascimento);
      if (isNaN(dob.getTime())) {
        errors.push({field: nascimentoEl, message: 'Data de nascimento inválida.'});
      } else {
        // checar idade mínima 10 anos (ajustável)
        const age = getAgeFromDOB(dob);
        if (age < 6) errors.push({field: nascimentoEl, message: 'Idade mínima 6 anos.'});
      }
    }
    // UF
    if (!uf) errors.push({field: ufEl, message: 'Selecione a UF.'});

    // Forma de contribuição: se voluntario -> pelo menos 1 checkbox marcado
    if (!forma) {
      errors.push({field: formaEl, message: 'Escolha a forma de contribuição.'});
    } else if (forma === 'voluntario') {
      const checked = formEl.querySelectorAll('#opcaoVoluntario input[type="checkbox"]:checked');
      if (!checked || checked.length === 0) {
        const container = formEl.querySelector('#opcaoVoluntario');
        errors.push({field: container, message: 'Escolha ao menos uma área de atuação.'});
      }
    } else if (forma === 'doador') {
      // se doador, checar escolha de método de doação
      const chosen = formEl.querySelector('#opcaoDoador input[type="radio"]:checked');
      if (!chosen) {
        const container = formEl.querySelector('#opcaoDoador');
        errors.push({field: container, message: 'Escolha uma forma de doação.'});
      }
    }

    return {ok: errors.length === 0, errors, data: {nome, email, contato, nascimento, uf, forma}};
  }

  function getAgeFromDOB(dob) {
    const diff = Date.now() - dob.getTime();
    const ageDt = new Date(diff);
    return Math.abs(ageDt.getUTCFullYear() - 1970);
  }

  /* ---------- Visual helpers for form validation ---------- */
  function clearValidation(formEl) {
    qsa('.pa-field-error', formEl).forEach(node => node.remove());
    qsa('.pa-invalid', formEl).forEach(node => node.classList.remove('pa-invalid'));
  }

  function showValidation(formEl, errors) {
    clearValidation(formEl);
    errors.forEach(err => {
      const field = err.field instanceof Element ? err.field : null;
      // mark container or the field itself
      let target = field;
      if (!target) {
        target = formEl;
      }
      if (field && field.querySelectorAll && field.querySelectorAll('input, select, textarea').length > 0) {
        // container containing inputs => choose first child to mark
        const child = field.querySelector('input, select, textarea') || field;
        child.classList.add('pa-invalid');
      } else if (field && (field.tagName === 'INPUT' || field.tagName === 'SELECT' || field.tagName === 'TEXTAREA')) {
        field.classList.add('pa-invalid');
      }

      // create small message element
      const msg = document.createElement('div');
      msg.className = 'pa-field-error';
      msg.textContent = err.message;
      if (field) {
        // insert after field or inside container
        if (field.tagName === 'INPUT' || field.tagName === 'SELECT' || field.tagName === 'TEXTAREA') {
          field.insertAdjacentElement('afterend', msg);
        } else {
          field.appendChild(msg);
        }
      } else {
        formEl.prepend(msg);
      }
    });
  }

  /* ---------- Initialize dynamic behaviors inside a main container ---------- */
  function initDynamicFeatures(container = document) {
    // Lightbox for images inside .galeria, .cards-projetos or .cards-impacto
    qsa('.galeria-container img, .cards-projetos img, .cards-impacto img, .img-destaque', container)
      .forEach(img => {
        img.style.cursor = 'zoom-in';
        img.addEventListener('click', () => openLightbox(img));
      });

    // Form handling: cadastro page
    const cadastroForm = container.querySelector('form[action="#"], form[action=""]') ||
                        container.querySelector('.formulario form') ||
                        container.querySelector('form');
    if (cadastroForm) {
      // prevent multiple bindings
      cadastroForm.removeEventListener?.('submit', cadastroSubmitHandler);
      cadastroForm.addEventListener('submit', cadastroSubmitHandler);
    }

    // small enhancement: add data-link to internal project cards to route to cadastro
    qsa('.projeto .botao, .card .botao, .participar .botao, .botao.destaque', container)
      .forEach(btn => {
        btn.addEventListener('click', (e) => {
          const href = btn.getAttribute('href') || btn.dataset.href;
          if (href && href.endsWith('.html')) {
            e.preventDefault();
            loadPage(href);
          }
        });
      });
  }

  /* ---------- Lightbox simple ---------- */
  function openLightbox(img) {
    // create overlay
    const overlay = document.createElement('div');
    overlay.className = 'pa-lightbox';
    overlay.innerHTML = `
      <div class="pa-lightbox-inner" role="dialog" aria-modal="true">
        <img src="${img.src}" alt="${img.alt || ''}">
        <button class="pa-lightbox-close" aria-label="Fechar">✕</button>
      </div>
    `;
    document.body.appendChild(overlay);
    // close handlers
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay || e.target.classList.contains('pa-lightbox-close')) {
        overlay.remove();
      }
    });
    // esc key
    window.setTimeout(() => {
      document.addEventListener('keydown', function esc(e) {
        if (e.key === 'Escape') {
          overlay.remove();
          document.removeEventListener('keydown', esc);
        }
      });
    }, 0);
  }

  /* ---------- Cadastro form submit handler ---------- */
  function cadastroSubmitHandler(e) {
    e.preventDefault();
    const form = e.currentTarget;
    clearValidation(form);
    const result = validateCadastroForm(form);
    if (!result.ok) {
      showValidation(form, result.errors);
      showMessage(form, 'Corrija os campos destacados e tente novamente.', 'error', 6000);
      return;
    }
    // gather additional details: checkboxes for volunteer areas or radio for doacao
    const details = {};
    if (result.data.forma === 'voluntario') {
      const areas = Array.from(form.querySelectorAll('#opcaoVoluntario input[type="checkbox"]:checked'))
                         .map(i => i.value);
      details.areas = areas;
    } else if (result.data.forma === 'doador') {
      const metodo = form.querySelector('#opcaoDoador input[type="radio"]:checked');
      details.metodo = metodo ? metodo.value : null;
    }
    // store
    const payload = Object.assign({}, result.data, details);
    saveSubmission(payload);

    // UX feedback
    showMessage(form, 'Cadastro registrado com sucesso. Obrigado pela contribuição!', 'success', 6000);
    form.reset();
    // hide conditional sections if any
    const vol = form.querySelector('#opcaoVoluntario'); if (vol) vol.style.display = 'none';
    const doa = form.querySelector('#opcaoDoador'); if (doa) doa.style.display = 'none';
  }

  /* ---------- Init SPA routing & popstate ---------- */
  function initRouting() {
    // intercept nav clicks
    document.addEventListener('click', handleLinkClicks);

    // on popstate, load the URL if necessary
    window.addEventListener('popstate', (ev) => {
      const url = location.pathname.split('/').pop() || 'index.html';
      loadPage(url, false);
    });
  }

  /* ---------- Mount: run on DOMContentLoaded ---------- */
  function mount() {
    // ensure script added with defer will run after initial DOM ready
    initRouting();
    initDynamicFeatures(document);
    // mark that SPA is active
    document.documentElement.classList.add('pa-spa-enabled');
  }

  // run mount
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }

  /* ---------- Expose debug helpers on window (optional) ---------- */
  window.ProjetoAir = {
    loadPage,
    getSubmissions,
    renderTemplate,
    STORAGE_KEY
  };

})(); // fim IIFE