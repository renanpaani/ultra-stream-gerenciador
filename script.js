// Global Variables
let currentUser = null;
let clientsUnsubscribe = null;

// State Management
const STATE = {
    clients: [],
    editingId: null,
    theme: localStorage.getItem('usg_theme') || 'dark', // Only Theme is local
    settings: { // Defaults, overwritten by DB
        companyName: 'UltraStream Gerenciador',
        billingMsg: 'Olá {nome}, seu plano {plano} vence dia {vencimento}. Para renovar, entre em contato!',
        prices: {
            monthly: { price: 30, cost: 10 },
            quarterly: { price: 80, cost: 25 },
            semiannual: { price: 140, cost: 50 },
            annual: { price: 250, cost: 90 }
        }
    }
};

// DOM Elements
const els = {
    authOverlay: document.getElementById('login-overlay'),
    loginView: document.getElementById('auth-login-view'),
    registerView: document.getElementById('auth-register-view'),
    loginForm: document.getElementById('login-form'),
    registerForm: document.getElementById('register-form'),
    btnGoogle: document.getElementById('btn-google-login'),
    btnLogout: document.getElementById('btn-logout'),

    // Main App
    navBtns: document.querySelectorAll('.nav-btn'),
    tabContents: document.querySelectorAll('.tab-content'),
    pageTitle: document.getElementById('page-title'),
    clientForm: document.getElementById('new-client-form'),
    clientsTableBody: document.getElementById('clients-table-body'),
    dashboardStats: document.querySelector('.stats-grid'),
    dashboardStats: document.querySelector('.stats-grid'),
    financialForm: document.getElementById('financial-settings-form'),
    generalSettingsForm: document.getElementById('general-settings-form'),
    profileForm: document.getElementById('profile-settings-form'),
    searchInput: document.getElementById('client-search'),
    statusFilter: document.getElementById('status-filter'),
    recentTable: document.getElementById('dashboard-recent-table'),
    timelineModal: document.getElementById('timeline-modal'),
    timelineList: document.getElementById('timeline-list'),
    closeTimelineBtn: document.getElementById('close-timeline'),
    simInputs: {
        price: document.getElementById('sim-price'),
        qty: document.getElementById('sim-qty'),
        cost: document.getElementById('sim-cost')
    },
    simResults: {
        revenue: document.getElementById('sim-revenue'),
        profit: document.getElementById('sim-profit')
    },
    ranking: {
        best: document.getElementById('rank-best'),
        worst: document.getElementById('rank-worst'),
        converted: document.getElementById('rank-converted')
    },
    revenue: {
        monthly: document.getElementById('rev-monthly'),
        quarterly: document.getElementById('rev-quarterly'),
        semiannual: document.getElementById('rev-semiannual'),
        annual: document.getElementById('rev-annual')
    }
};

// --- Initialization ---
function init() {
    setupAuthListeners();
    setupNavigation();
    setupForms();
    setupLogout(); // Added Logout
    applyTheme();

    // Clear old localstorage data (Privacy Request)
    localStorage.removeItem('usg_clients');
    localStorage.removeItem('usg_settings');
}

// --- Auth Logic ---
function setupAuthListeners() {
    // 1. Auth State Observer
    auth.onAuthStateChanged((user) => {
        if (user) {
            currentUser = user;
            els.authOverlay.classList.remove('active');
            loadUserProfileUI();
            loadSettingsFromDB();
            setupRealtimeClientsListener();
        } else {
            currentUser = null;
            els.authOverlay.classList.add('active');
            STATE.clients = [];
            if (clientsUnsubscribe) clientsUnsubscribe();
            resetDashboard();
        }
    });

    // 2. View Switching
    document.getElementById('go-to-register').addEventListener('click', (e) => {
        e.preventDefault();
        els.loginView.style.display = 'none';
        els.registerView.style.display = 'block';
    });

    document.getElementById('go-to-login').addEventListener('click', (e) => {
        e.preventDefault();
        els.registerView.style.display = 'none';
        els.loginView.style.display = 'block';
    });

    // 3. Login Flow
    els.loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const pass = document.getElementById('login-pass').value;

        auth.signInWithEmailAndPassword(email, pass)
            .catch((error) => {
                alert('Erro no Login: ' + error.message);
            });
    });

    // 4. Register Flow
    els.registerForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = document.getElementById('reg-name').value;
        const whatsapp = document.getElementById('reg-whatsapp').value;
        const email = document.getElementById('reg-email').value;
        const pass = document.getElementById('reg-pass').value;

        auth.createUserWithEmailAndPassword(email, pass)
            .then((res) => {
                const userProfile = {
                    displayName: name,
                    email: email,
                    whatsapp: whatsapp,
                    role: 'admin',
                    createdAt: new Date().toISOString()
                };

                // Update Auth Profile too
                res.user.updateProfile({ displayName: name });

                return db.collection('users').doc(res.user.uid).set(userProfile);
            })
            .then(() => {
                alert('Conta criada com sucesso! WhatsApp registrado.');
            })
            .catch((error) => {
                alert('Erro no Cadastro: ' + error.message);
            });
    });

    // 5. Google Auth
    if (els.btnGoogle) {
        els.btnGoogle.addEventListener('click', () => {
            const provider = new firebase.auth.GoogleAuthProvider();
            auth.signInWithPopup(provider)
                .then((result) => {
                    const user = result.user;
                    const userRef = db.collection('users').doc(user.uid);
                    userRef.get().then((doc) => {
                        if (!doc.exists) {
                            const userProfile = {
                                displayName: user.displayName,
                                email: user.email,
                                role: 'admin',
                                createdAt: new Date().toISOString(),
                                photoURL: user.photoURL
                            };
                            userRef.set(userProfile);
                        }
                    });
                })
                .catch((error) => {
                    if (error.code === 'auth/configuration-not-found') {
                        alert('⚠️ Login Google Desativado no Console Firebase.');
                    } else {
                        alert('Erro no Login Google: ' + error.message);
                    }
                });
        });
    }
}

function resetDashboard() {
    els.clientsTableBody.innerHTML = '';
    renderDashboard();
}

// --- Data Logic (Scoped) ---

// 1. Settings (One doc per user: users/{uid}/data/settings)
function loadSettingsFromDB() {
    if (!currentUser) return;

    db.collection('users').doc(currentUser.uid).collection('data').doc('settings')
        .get().then((doc) => {
            if (doc.exists) {
                STATE.settings = doc.data();
                loadSettingsIntoForm();
                renderDashboard(); // Re-calc with new prices
            } else {
                // First time: Save defaults
                saveSettingsToDB();
            }
        }).catch(error => {
            console.error("Error getting settings:", error);
            if (error.code === 'permission-denied') {
                alert('Acesso Negado (Configurações): Verifique Regras.');
            }
        });
}

function saveSettingsToDB() {
    if (!currentUser) return;
    db.collection('users').doc(currentUser.uid).collection('data').doc('settings')
        .set(STATE.settings)
        .then(() => console.log('Settings Saved'));
}

// 2. Clients (Collection: users/{uid}/clients)
function setupRealtimeClientsListener() {
    if (!currentUser) return;

    // Unsubscribe previous listener if exists
    if (clientsUnsubscribe) clientsUnsubscribe();

    clientsUnsubscribe = db.collection('users').doc(currentUser.uid).collection('clients')
        .onSnapshot((snapshot) => {
            STATE.clients = [];
            snapshot.forEach((doc) => {
                STATE.clients.push({ id: doc.id, ...doc.data() });
            });

            renderDashboard();
            renderClientsTable();
        }, (error) => {
            console.error("Error getting clients: ", error);
            if (error.code === 'permission-denied') {
                alert('Acesso Negado: Suas Regras de Segurança no Firebase podem estar incorretas.\nVerifique se copiou as regras exatamente como enviado.');
            }
        });
}

function addClient(clientData) {
    if (!currentUser) return;

    const actionPromise = STATE.editingId ? updateClientLogic(clientData) : createClientLogic(clientData);

    actionPromise
        .then(() => {
            alert('Salvo com sucesso!');
            resetForm();
        })
        .catch((e) => {
            console.error("Erro ao salvar:", e);
            if (e.code === 'permission-denied') {
                alert('Erro de Permissão: Você não tem permissão para salvar dados.\nVerifique as Regras do Firebase.');
            } else {
                alert('Erro ao salvar: ' + e.message);
            }
        });
}

function createClientLogic(clientData) {
    const newClient = {
        createdAt: new Date().toISOString(),
        history: [{
            date: new Date().toISOString(),
            type: 'create',
            desc: 'Cliente Cadastrado'
        }],
        ...clientData
    };
    return db.collection('users').doc(currentUser.uid).collection('clients').add(newClient);
}

function updateClientLogic(clientData) {
    const index = STATE.clients.findIndex(c => c.id === STATE.editingId);
    if (index === -1) return Promise.reject("Client not found locally");

    const oldClient = STATE.clients[index];
    const newHistory = [...(oldClient.history || [])];

    if (new Date(clientData.dueDate) > new Date(oldClient.dueDate)) {
        newHistory.push({
            date: new Date().toISOString(),
            type: 'renewal',
            desc: `Renovado até ${formatDate(clientData.dueDate)}`
        });
    } else if (oldClient.planType === 'trial' && clientData.planType !== 'trial') {
        newHistory.push({
            date: new Date().toISOString(),
            type: 'conversion',
            desc: `🏆 Trial Convertido: ${getPlanLabel(clientData.planType)}`
        });
    } else {
        newHistory.push({
            date: new Date().toISOString(),
            type: 'update',
            desc: 'Dados atualizados'
        });
    }

    return db.collection('users').doc(currentUser.uid).collection('clients').doc(STATE.editingId)
        .update({ ...clientData, history: newHistory });
}

function deleteClient(id) {
    if (!currentUser) return;
    if (confirm('Excluir este cliente?')) {
        db.collection('users').doc(currentUser.uid).collection('clients').doc(id).delete()
            .then(() => alert('Cliente excluído.'))
            .catch(e => {
                console.error(e);
                alert('Erro ao excluir: ' + e.message);
            });
    }
}

// --- Setup Forms & UI ---
function setupNavigation() {
    els.navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            els.navBtns.forEach(b => b.classList.remove('active'));
            els.tabContents.forEach(c => c.classList.remove('active'));

            btn.classList.add('active');
            const tabId = btn.getAttribute('data-tab');
            document.getElementById(tabId).classList.add('active');
            els.pageTitle.textContent = btn.querySelector('span').textContent;

            if (tabId === 'dashboard') renderDashboard();
            if (tabId === 'list-clients') renderClientsTable();
        });
    });
}

function setupForms() {
    setupSimulator();

    els.clientForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const fd = new FormData(els.clientForm);
        const data = Object.fromEntries(fd.entries());
        addClient(data);
    });

    els.financialForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const fd = new FormData(els.financialForm);
        STATE.settings.prices.monthly.price = parseFloat(fd.get('price_monthly'));
        STATE.settings.prices.monthly.cost = parseFloat(fd.get('cost_monthly'));
        STATE.settings.prices.quarterly.price = parseFloat(fd.get('price_quarterly'));
        STATE.settings.prices.quarterly.cost = parseFloat(fd.get('cost_quarterly'));
        STATE.settings.prices.semiannual.price = parseFloat(fd.get('price_semiannual'));
        STATE.settings.prices.semiannual.cost = parseFloat(fd.get('cost_semiannual'));
        STATE.settings.prices.annual.price = parseFloat(fd.get('price_annual'));
        STATE.settings.prices.annual.cost = parseFloat(fd.get('cost_annual'));
        saveSettingsToDB();
        alert('Configurações salvas na Nuvem!');
    });

    els.generalSettingsForm.addEventListener('submit', (e) => {
        e.preventDefault();
        STATE.settings.companyName = document.getElementById('company-name').value;
        STATE.settings.billingMsg = document.getElementById('billing-msg').value;
        saveSettingsToDB();
        alert('Configurações salvas!');
    });

    els.profileForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const displayName = document.getElementById('profile-name').value;
        const photoURL = document.getElementById('profile-photo').value;
        const whatsapp = document.getElementById('profile-whatsapp').value;

        if (!currentUser) return;

        currentUser.updateProfile({ displayName, photoURL })
            .then(() => {
                // Sync with Firestore (Use set/merge to be safe)
                return db.collection('users').doc(currentUser.uid).set({
                    displayName,
                    photoURL,
                    whatsapp,
                    email: currentUser.email,
                    lastUpdated: new Date().toISOString()
                }, { merge: true });
            })
            .then(() => {
                alert('Perfil atualizado com sucesso!');
                loadUserProfileUI(); // Refresh Sidebar
            })
            .catch((error) => {
                console.error("Profile Update Error:", error);
                alert('Erro ao atualizar perfil: ' + error.message);
            });
    });

    // Advanced Profile Actions
    document.getElementById('btn-reset-pass').addEventListener('click', () => {
        if (!currentUser) return;
        auth.sendPasswordResetEmail(currentUser.email)
            .then(() => alert('Link de redefinição enviado para seu email: ' + currentUser.email))
            .catch(err => alert('Erro: ' + err.message));
    });

    document.getElementById('btn-change-email-verify').addEventListener('click', () => {
        const newEmail = prompt('Digite o novo endereço de email:');
        if (!newEmail || newEmail === currentUser.email) return;

        currentUser.updateEmail(newEmail)
            .then(() => {
                alert('Email alterado com sucesso! Use o novo email no próximo login.');
                loadUserProfileUI();
            })
            .catch(err => {
                if (err.code === 'auth/requires-recent-login') {
                    alert('⚠️ Por segurança, saia e entre novamente no sistema antes de trocar o email.');
                } else {
                    alert('Erro ao trocar email: ' + err.message);
                }
            });
    });

    els.searchInput.addEventListener('input', renderClientsTable);
    els.statusFilter.addEventListener('change', renderClientsTable);

    els.closeTimelineBtn.addEventListener('click', () => els.timelineModal.classList.remove('active'));
    els.timelineModal.addEventListener('click', (e) => {
        if (e.target === els.timelineModal) els.timelineModal.classList.remove('active');
    });

    document.getElementById('add-timeline-note-btn').addEventListener('click', addTimelineNote);
    document.getElementById('cancel-add').addEventListener('click', () => {
        resetForm();
        els.navBtns[2].click();
    });

    document.querySelector('.theme-toggle').addEventListener('click', toggleTheme);
}

// --- Logic Helpers ---

// Dashboard & Tables (Identical logic, just using STATE.clients)
function renderDashboard() {
    const today = new Date();
    const total = STATE.clients.length;
    const active = STATE.clients.filter(c => c.status === 'active').length;
    const expiring = STATE.clients.filter(c => {
        if (c.status !== 'active') return false;
        const due = new Date(c.dueDate);
        const diffTime = due - today;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays >= 0 && diffDays <= 3;
    }).length;

    const rev = calculateRevenue();
    const rank = calculateRanking();

    els.dashboardStats.innerHTML = `
        <div class="stat-card">
            <div class="stat-icon"><i class='bx bx-user'></i></div>
            <div class="stat-info"><h5>Total</h5><h3>${total}</h3></div>
        </div>
        <div class="stat-card">
            <div class="stat-icon green"><i class='bx bx-check-circle'></i></div>
            <div class="stat-info"><h5>Ativos</h5><h3>${active}</h3></div>
        </div>
        <div class="stat-card">
            <div class="stat-icon orange"><i class='bx bx-time-five'></i></div>
            <div class="stat-info"><h5>Vencendo</h5><h3>${expiring}</h3></div>
        </div>
        <div class="stat-card">
            <div class="stat-icon"><i class='bx bx-money'></i></div>
            <div class="stat-info"><h5>Mensal</h5><h3>${formatCurrency(rev.monthly)}</h3></div>
        </div>
    `;

    els.revenue.monthly.textContent = formatCurrency(rev.monthly);
    els.revenue.quarterly.textContent = formatCurrency(rev.quarterly);
    els.revenue.semiannual.textContent = formatCurrency(rev.semiannual);
    els.revenue.annual.textContent = formatCurrency(rev.annual);

    els.ranking.best.textContent = rank.best;
    els.ranking.worst.textContent = rank.worst;
    els.ranking.converted.textContent = rank.converted;

    const recent = [...STATE.clients].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);
    els.recentTable.innerHTML = recent.map(c => `
        <tr><td>${c.fullName}</td><td>${getPlanLabel(c.planType)}</td><td><span class="status-badge ${c.status}">${getStatusLabel(c.status)}</span></td></tr>
    `).join('');
}

function calculateRevenue() {
    const counts = { monthly: 0, quarterly: 0, semiannual: 0, annual: 0 };
    STATE.clients.forEach(c => {
        if (c.status === 'active' && counts[c.planType] !== undefined) counts[c.planType]++;
    });
    const p = STATE.settings.prices;
    return {
        monthly: counts.monthly * p.monthly.price,
        quarterly: counts.quarterly * p.quarterly.price,
        semiannual: counts.semiannual * p.semiannual.price,
        annual: counts.annual * p.annual.price
    };
}

function calculateRanking() {
    const planCounts = {};
    let trialsConverted = 0;
    STATE.clients.forEach(c => {
        if (!planCounts[c.planType]) planCounts[c.planType] = 0;
        planCounts[c.planType]++;
        if (c.history && c.history.some(h => h.type === 'conversion')) trialsConverted++;
    });
    const sortedPlans = Object.entries(planCounts).sort((a, b) => b[1] - a[1]);
    return {
        best: sortedPlans.length > 0 ? getPlanLabel(sortedPlans[0][0]) : '-',
        worst: sortedPlans.length > 0 ? getPlanLabel(sortedPlans[sortedPlans.length - 1][0]) : '-',
        converted: trialsConverted
    };
}

function renderClientsTable() {
    const term = els.searchInput.value.toLowerCase();
    const status = els.statusFilter.value;

    const filtered = STATE.clients.filter(c => {
        const matchesText = c.fullName.toLowerCase().includes(term) || (c.iptvUser && c.iptvUser.toLowerCase().includes(term));
        const matchesStatus = status === 'all' ||
            (status === 'active' && c.status === 'active') ||
            (status === 'expired' && c.status === 'expired') ||
            (status === 'expiring' && isExpiring(c.dueDate));
        return matchesText && matchesStatus;
    });

    els.clientsTableBody.innerHTML = filtered.map(c => {
        let displayStatus = c.status;
        if (c.status === 'active' && isExpiring(c.dueDate)) displayStatus = 'expiring';
        else if (c.status === 'active' && new Date(c.dueDate) < new Date()) displayStatus = 'expired';

        return `
        <tr>
            <td>
                <div style="font-weight: 500">${c.fullName}</div>
                <div style="display: flex; gap: 8px; font-size: 0.8em; color: var(--text-secondary)">
                    <span class="sensitive-data" id="user-${c.id}">${c.iptvUser || '-'}</span>
                    <button class="toggle-visibility-btn" onclick="toggleVisibility('user-${c.id}', this)"><i class='bx bx-show'></i></button>
                </div>
            </td>
            <td>${c.phone}</td>
            <td>
               <div style="display: flex; gap: 8px;">
                    <span class="sensitive-data" id="pass-${c.id}">${c.iptvPass || '***'}</span>
                    <button class="toggle-visibility-btn" onclick="toggleVisibility('pass-${c.id}', this)"><i class='bx bx-show'></i></button>
                </div>
            </td>
            <td>${getPlanLabel(c.planType)}</td>
            <td>${formatDate(c.dueDate)}</td>
            <td><span class="status-badge ${displayStatus}">${getStatusLabel(displayStatus)}</span></td>
            <td>
                <button class="btn-icon-small" title="WhatsApp" onclick="sendWhatsapp('${c.id}')"><i class='bx bxl-whatsapp'></i></button>
                <button class="btn-icon-small" title="Timeline" onclick="openTimeline('${c.id}')"><i class='bx bx-time-five'></i></button>
                <button class="btn-icon-small" title="Editar" onclick="editClient('${c.id}')"><i class='bx bx-pencil'></i></button>
                <button class="btn-icon-small" title="Excluir" onclick="deleteClient('${c.id}')"><i class='bx bx-trash'></i></button>
            </td>
        </tr>
    `}).join('');
}

// Helpers & Utilities
function setupSimulator() {
    const run = () => {
        const p = parseFloat(els.simInputs.price.value) || 0;
        const q = parseFloat(els.simInputs.qty.value) || 0;
        const c = parseFloat(els.simInputs.cost.value) || 0;
        els.simResults.revenue.textContent = formatCurrency(p * q);
        els.simResults.profit.textContent = formatCurrency((p * q) - (c * q));
    };
    els.simInputs.price.addEventListener('input', run);
    els.simInputs.qty.addEventListener('input', run);
    els.simInputs.cost.addEventListener('input', run);
}

function resetForm() {
    STATE.editingId = null;
    document.querySelector('#new-client-form button[type="submit"]').textContent = 'Salvar Cliente';
    document.querySelector('#add-client h3').textContent = 'Cadastrar Novo Cliente';
    els.clientForm.reset();
}

function loadSettingsIntoForm() {
    const p = STATE.settings.prices;
    const f = els.financialForm;
    f.querySelector('[name="price_monthly"]').value = p.monthly.price;
    f.querySelector('[name="cost_monthly"]').value = p.monthly.cost;
    f.querySelector('[name="price_quarterly"]').value = p.quarterly.price;
    f.querySelector('[name="cost_quarterly"]').value = p.quarterly.cost;
    f.querySelector('[name="price_semiannual"]').value = p.semiannual.price;
    f.querySelector('[name="cost_semiannual"]').value = p.semiannual.cost;
    f.querySelector('[name="price_annual"]').value = p.annual.price;
    f.querySelector('[name="cost_annual"]').value = p.annual.cost;
    document.getElementById('company-name').value = STATE.settings.companyName;
    document.getElementById('billing-msg').value = STATE.settings.billingMsg;
}

function toggleTheme() {
    STATE.theme = STATE.theme === 'dark' ? 'light' : 'dark';
    applyTheme();
    localStorage.setItem('usg_theme', STATE.theme);
}

function applyTheme() {
    const btn = document.querySelector('.theme-toggle i');
    if (STATE.theme === 'light') {
        document.body.classList.add('light-theme');
        btn.className = 'bx bx-sun';
    } else {
        document.body.classList.remove('light-theme');
        btn.className = 'bx bx-moon';
    }
}

// Global (Window) Helpers
window.formatCurrency = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
window.formatDate = (d) => { if (!d) return '-'; const [y, m, x] = d.split('-'); return `${x}/${m}/${y}`; };
window.getPlanLabel = (t) => ({ monthly: 'Mensal', quarterly: 'Trimestral', semiannual: 'Semestral', annual: 'Anual', trial: 'Teste' }[t] || t);
window.getStatusLabel = (s) => ({ active: 'Ativo', pending: 'Pendente', expired: 'Vencido', expiring: 'Vencendo' }[s] || s);
window.isExpiring = (d) => { if (!d) return false; const diff = (new Date(d) - new Date()) / 864e5; return diff >= 0 && diff <= 3; };

window.toggleVisibility = (id, btn) => {
    const el = document.getElementById(id);
    el.classList.toggle('visible');
    btn.querySelector('i').className = el.classList.contains('visible') ? 'bx bx-hide' : 'bx bx-show';
};

window.editClient = (id) => {
    const client = STATE.clients.find(c => c.id === id);
    if (!client) return;
    STATE.editingId = id;
    els.navBtns[1].click();
    document.querySelector('#add-client h3').textContent = 'Editar Cliente';
    document.querySelector('#new-client-form button[type="submit"]').textContent = 'Atualizar Cliente';
    const f = els.clientForm;
    f.fullName.value = client.fullName;
    f.phone.value = client.phone;
    f.iptvUser.value = client.iptvUser || '';
    f.iptvPass.value = client.iptvPass || '';
    f.planType.value = client.planType;
    f.status.value = client.status;
    f.dueDate.value = client.dueDate;
    f.notes.value = client.notes || '';
};

window.openTimeline = (id) => {
    const client = STATE.clients.find(c => c.id === id);
    if (!client) return;
    els.timelineModal.setAttribute('data-client-id', id);
    const history = client.history || [];
    els.timelineList.innerHTML = history.sort((a, b) => new Date(b.date) - new Date(a.date)).map(h => {
        const d = new Date(h.date);
        const icon = { warning: '⚠️', renewal: '💰', update: '🖊️', note: '📝' }[h.type] || '📅';
        return `<div class="timeline-item"><div class="timeline-date">${d.getDate()}/${d.getMonth() + 1}</div><div class="timeline-content">${icon} ${h.desc}</div></div>`;
    }).join('');
    els.timelineModal.classList.add('active');
};

window.addTimelineNote = () => {
    const id = els.timelineModal.getAttribute('data-client-id');
    const note = document.getElementById('new-timeline-note').value.trim();
    if (!note || !id || !currentUser) return;
    db.collection('users').doc(currentUser.uid).collection('clients').doc(id).get().then(doc => {
        if (doc.exists) {
            const h = [...(doc.data().history || [])];
            h.push({ date: new Date().toISOString(), type: 'note', desc: note });
            return db.collection('users').doc(currentUser.uid).collection('clients').doc(id).update({ history: h });
        }
    }).then(() => document.getElementById('new-timeline-note').value = '');
};

window.sendWhatsapp = (id) => {
    const c = STATE.clients.find(x => x.id === id);
    if (!c) return;
    let msg = STATE.settings.billingMsg.replace('{nome}', c.fullName).replace('{plano}', getPlanLabel(c.planType)).replace('{vencimento}', formatDate(c.dueDate));
    window.open(`https://wa.me/55${c.phone.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`, '_blank');
    // Add Warning History logic locally, or just let user do it? Logic needs to act on DB.
    if (currentUser) {
        db.collection('users').doc(currentUser.uid).collection('clients').doc(id).get().then(doc => {
            if (doc.exists) {
                const h = [...(doc.data().history || [])];
                h.push({ date: new Date().toISOString(), type: 'warning', desc: 'Cobrança enviada' });
                db.collection('users').doc(currentUser.uid).collection('clients').doc(id).update({ history: h });
            }
        });
    }
};

window.deleteClient = deleteClient;

// Start App
// --- User Profile ---
// --- User Profile ---
function loadUserProfileUI() {
    if (!currentUser) return;

    // Sidebar & Base Info
    const nameDisplay = currentUser.displayName || 'Usuário';
    document.querySelector('.user-details .name').textContent = nameDisplay;
    document.querySelector('.user-details .role').textContent = currentUser.email;

    // Avatar
    const avatarEl = document.querySelector('.avatar');
    if (currentUser.photoURL) {
        avatarEl.innerHTML = `<img src="${currentUser.photoURL}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
    } else {
        avatarEl.textContent = nameDisplay.charAt(0).toUpperCase();
    }

    // Pre-fill form (Auth Data)
    document.getElementById('profile-name').value = nameDisplay;
    document.getElementById('profile-email').value = currentUser.email;
    document.getElementById('profile-photo').value = currentUser.photoURL || '';

    // Fetch Extra Data from Firestore (WhatsApp)
    db.collection('users').doc(currentUser.uid).get().then(doc => {
        if (doc.exists) {
            const data = doc.data();
            if (data.whatsapp) {
                document.getElementById('profile-whatsapp').value = data.whatsapp;
            }
        }
    });
}

function setupLogout() {
    const btn = document.getElementById('btn-logout');
    if (btn) {
        btn.addEventListener('click', () => {
            if (confirm('Tem certeza que deseja sair?')) {
                auth.signOut().then(() => {
                    console.log("Deslogado com sucesso");
                }).catch(e => console.error("Erro logout:", e));
            }
        });
    }
}

// Start App safely
window.addEventListener('load', () => {
    try {
        init();
    } catch (e) {
        console.error("Init Error:", e);
        alert("Erro ao iniciar aplicativo: " + e.message);
    }
});
