    /* ═══════════════════════════════════════════════════════════════
       Firebase Config — dados do seu projeto
    ═══════════════════════════════════════════════════════════════ */
    const firebaseConfig = {
      apiKey: "AIzaSyDmM1iUeIR3zL-xiOTjCdRd8Ta9ZFeD2-0",
      authDomain: "qrcodelink-b6648.firebaseapp.com",
      projectId: "qrcodelink-b6648",
      storageBucket: "qrcodelink-b6648.firebasestorage.app",
      messagingSenderId: "951656935388",
      appId: "1:951656935388:web:12225071489a82ff5ba919",
      measurementId: "G-7NLNMC2HFL"
    };

    /* ═══════════════════════════════════════════════════════════════
       Variáveis globais
    ═══════════════════════════════════════════════════════════════ */
    let db = null;
    let useLocal = false;
    let localLinks = [];
    let currentCanvas = null;
    let currentURL = '';

    /* ═══════════════════════════════════════════════════════════════
       Inicialização do Firebase (SDK Compat via CDN)
    ═══════════════════════════════════════════════════════════════ */
    try {
      // Verifica se já foi inicializado (evita erro em HMR/refresh)
      if (!firebase.apps || !firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
      }
      db = firebase.firestore();

      // Teste de conexão: tenta ler um documento da coleção
      db.collection('qrcodes').limit(1).get()
        .then(() => {
          // Conexão OK — usa Firestore
          useLocal = false;
          updateStatus(true);
          loadLinks();
        })
        .catch((err) => {
          console.warn('Firestore indisponivel, usando localStorage:', err.message);
          useLocal = true;
          loadLocalFromStorage();
          updateStatus(false);
          loadLinks();
        });
    } catch (err) {
      console.warn('Erro ao iniciar Firebase:', err);
      useLocal = true;
      loadLocalFromStorage();
      updateStatus(false);
      loadLinks();
    }

    /* ═══════════════════════════════════════════════════════════════
       Barra de status (online/offline)
    ═══════════════════════════════════════════════════════════════ */
    function updateStatus(online) {
      const bar = document.getElementById('statusBar');
      const txt = document.getElementById('statusText');
      if (online) {
        bar.className = 'status-bar online';
        txt.textContent = 'Conectado ao Firebase';
      } else {
        bar.className = 'status-bar offline';
        txt.textContent = 'Modo local — dados salvos no navegador';
      }
    }

    /* ═══════════════════════════════════════════════════════════════
       Persistência local (fallback)
    ═══════════════════════════════════════════════════════════════ */
    function loadLocalFromStorage() {
      try {
        const data = localStorage.getItem('qrcodes_local');
        localLinks = data ? JSON.parse(data) : [];
      } catch {
        localLinks = [];
      }
    }

    function saveLocalToStorage() {
      try {
        localStorage.setItem('qrcodes_local', JSON.stringify(localLinks));
      } catch { /* quota excedida — ignora */ }
    }

    /* ═══════════════════════════════════════════════════════════════
       Gerar QR Code
    ═══════════════════════════════════════════════════════════════ */
    function generate() {
      const val = document.getElementById('urlInput').value.trim();
      if (!val) {
        showToast('Digite uma URL ou texto');
        document.getElementById('urlInput').focus();
        return;
      }

      setLoading(true);
      currentURL = val;

      const box = document.getElementById('qrBox');
      box.innerHTML = '';
      currentCanvas = null;

      // Tamanho adaptativo ao container
      const frameSize = Math.min(200, box.parentElement.clientWidth - 80);

      setTimeout(() => {
        try {
          new QRCode(box, {
            text: val,
            width: frameSize,
            height: frameSize,
            colorDark: '#003087',
            colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.H
          });
        } catch (err) {
          showToast('Erro ao gerar QR Code');
          setLoading(false);
          return;
        }

        setTimeout(() => {
          currentCanvas = box.querySelector('canvas');

          document.getElementById('qrLabel').textContent =
            val.length > 52 ? val.slice(0, 49) + '...' : val;

          document.getElementById('qrSection').classList.add('visible');
          setLoading(false);
          saveLink(val);
        }, 200);
      }, 50);
    }

    /* ═══════════════════════════════════════════════════════════════
       Loading state do botão
    ═══════════════════════════════════════════════════════════════ */
    function setLoading(on) {
      const btn = document.getElementById('btnGenerate');
      const sp = document.getElementById('spinner');
      const ic = document.getElementById('btnIcon');
      btn.disabled = on;
      sp.style.display = on ? 'block' : 'none';
      ic.style.display = on ? 'none' : 'block';
    }

    /* ═══════════════════════════════════════════════════════════════
       Salvar link
    ═══════════════════════════════════════════════════════════════ */
    function saveLink(url) {
      const entry = { url, createdAt: new Date().toISOString() };

      if (useLocal || !db) {
        localLinks.unshift(entry);
        saveLocalToStorage();
        renderList(localLinks);
        showToast('Salvo localmente');
        return;
      }

      db.collection('qrcodes')
        .add({
          url,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        })
        .then(() => {
          showToast('Salvo no Firebase');
          loadLinks();
        })
        .catch((err) => {
          console.warn('Falha ao salvar no Firestore, usando local:', err.message);
          localLinks.unshift(entry);
          saveLocalToStorage();
          renderList(localLinks);
          showToast('Firebase offline — salvo localmente');
        });
    }

    /* ═══════════════════════════════════════════════════════════════
       Carregar links do Firestore
    ═══════════════════════════════════════════════════════════════ */
    function loadLinks() {
      if (useLocal || !db) {
        renderList(localLinks);
        return;
      }

      db.collection('qrcodes')
        .orderBy('createdAt', 'desc')
        .limit(50)
        .get()
        .then((snap) => {
          const items = snap.docs.map((d) => ({
            id: d.id,
            ...d.data()
          }));
          renderList(items);
        })
        .catch((err) => {
          console.warn('Erro ao carregar do Firestore:', err.message);
          useLocal = true;
          loadLocalFromStorage();
          updateStatus(false);
          renderList(localLinks);
        });
    }

    /* ═══════════════════════════════════════════════════════════════
       Renderizar lista
    ═══════════════════════════════════════════════════════════════ */
    function renderList(items) {
      const container = document.getElementById('listContainer');
      document.getElementById('countBadge').textContent = items.length;

      if (!items.length) {
        container.innerHTML = '';
        const empty = document.createElement('div');
        empty.className = 'empty-state';
        empty.innerHTML = `
          <i data-lucide="inbox"></i>
          <p>Nenhum QR Code gerado ainda</p>
          <span>Cole uma URL acima para comecar</span>
        `;
        container.appendChild(empty);
        lucide.createIcons({ attrs: { strokeWidth: 1.5 } });
        return;
      }

      container.innerHTML = '<div class="link-list" id="linkList"></div>';
      const list = document.getElementById('linkList');

      items.forEach((item, i) => {
        const row = document.createElement('div');
        row.className = 'link-item';
        row.style.animationDelay = `${i * 0.04}s`;

        // Formatar data
        let dateStr = '';
        if (item.createdAt) {
          const date = item.createdAt.toDate
            ? item.createdAt.toDate()
            : new Date(item.createdAt);
          dateStr = date.toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          });
        }

        // Escapar aspas simples para o onclick inline
        const urlSafe = item.url.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        const itemId = item.id || '';

        row.innerHTML = `
          <div class="item-thumb" id="thumb-${i}" title="Clique para copiar URL"
               onclick="copyURL('${urlSafe}')"></div>
          <div class="item-body">
            <div class="item-url" title="${item.url}">${item.url}</div>
            <div class="item-date">${dateStr}</div>
          </div>
          <div class="item-actions">
            <button class="btn-icon" title="Copiar URL"
                    onclick="copyURL('${urlSafe}')" aria-label="Copiar URL">
              <i data-lucide="copy"></i>
            </button>
            <button class="btn-icon del" title="Remover"
                    onclick="removeItem('${itemId}', ${i})" aria-label="Remover">
              <i data-lucide="trash-2"></i>
            </button>
          </div>
        `;

        list.appendChild(row);
      });

      // Re-renderizar ícones Lucide nos novos elementos
      lucide.createIcons({ attrs: { strokeWidth: 1.5 } });

      // Gerar mini QR Codes com stagger para não travar a UI
      items.forEach((item, i) => {
        setTimeout(() => {
          const thumb = document.getElementById('thumb-' + i);
          if (thumb) {
            try {
              new QRCode(thumb, {
                text: item.url,
                width: 46,
                height: 46,
                colorDark: '#003087',
                colorLight: '#ffffff',
                correctLevel: QRCode.CorrectLevel.L
              });
            } catch { /* ignora falha de mini QR */ }
          }
        }, i * 30);
      });
    }

    /* ═══════════════════════════════════════════════════════════════
       Remover item
    ═══════════════════════════════════════════════════════════════ */
    function removeItem(firestoreId, index) {
      if (useLocal || !db || !firestoreId) {
        // Remove do array local pelo índice
        localLinks.splice(index, 1);
        saveLocalToStorage();
        renderList(localLinks);
        showToast('Removido');
        return;
      }

      // Remove do Firestore
      db.collection('qrcodes').doc(firestoreId).delete()
        .then(() => {
          loadLinks();
          showToast('Removido do Firebase');
        })
        .catch((err) => {
          console.warn('Erro ao remover:', err.message);
          showToast('Erro ao remover');
        });
    }

    /* ═══════════════════════════════════════════════════════════════
       Copiar URL
    ═══════════════════════════════════════════════════════════════ */
    function copyURL(url) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url)
          .then(() => showToast('URL copiada!'))
          .catch(() => fallbackCopy(url));
      } else {
        fallbackCopy(url);
      }
    }

    function copyCurrentURL() {
      if (currentURL) copyURL(currentURL);
    }

    function fallbackCopy(text) {
      const el = document.createElement('textarea');
      el.value = text;
      el.style.position = 'fixed';
      el.style.left = '-9999px';
      document.body.appendChild(el);
      el.select();
      try {
        document.execCommand('copy');
        showToast('URL copiada!');
      } catch {
        showToast('Nao foi possivel copiar');
      }
      document.body.removeChild(el);
    }

    /* ═══════════════════════════════════════════════════════════════
       Download do QR Code
    ═══════════════════════════════════════════════════════════════ */
    function downloadQR() {
      if (!currentCanvas) {
        showToast('Nenhum QR Code para baixar');
        return;
      }
      const a = document.createElement('a');
      a.href = currentCanvas.toDataURL('image/png');
      a.download = 'qrcode-senai.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      showToast('Download iniciado');
    }

    /* ═══════════════════════════════════════════════════════════════
       Toast notification
    ═══════════════════════════════════════════════════════════════ */
    let toastTimer;
    function showToast(msg) {
      const t = document.getElementById('toast');
      document.getElementById('toastMsg').textContent = msg;
      t.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
    }

    /* ═══════════════════════════════════════════════════════════════
       Atalho: Enter para gerar
    ═══════════════════════════════════════════════════════════════ */
    document.getElementById('urlInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') generate();
    });

    /* ═══════════════════════════════════════════════════════════════
       Monitor de conexão — atualiza a barra em tempo real
    ═══════════════════════════════════════════════════════════════ */
    window.addEventListener('online', () => {
      if (db) {
        db.collection('qrcodes').limit(1).get()
          .then(() => {
            useLocal = false;
            updateStatus(true);
            loadLinks();
            showToast('Conexao restaurada');
          })
          .catch(() => {
            updateStatus(false);
          });
      }
    });

    window.addEventListener('offline', () => {
      useLocal = true;
      updateStatus(false);
      showToast('Voce esta offline — modo local ativado');
    });

    /* ═══════════════════════════════════════════════════════════════
       Inicializar ícones Lucide
    ═══════════════════════════════════════════════════════════════ */
    lucide.createIcons({ attrs: { strokeWidth: 1.5 } });