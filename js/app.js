// ===== Supabase client =====
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ===== State =====
let allResources = [];    // approved resources from the database
let departments = [];     // [{id, name}]
let selectedDept = 'ALL';
let currentProfile = null; // the logged-in student's profile (name + index number)

// ===== Elements =====
const grid = document.getElementById('resource-grid');
const emptyMsg = document.getElementById('empty');
const searchInput = document.getElementById('search-input');
const clearBtn = document.getElementById('clear-filter');
const nav = document.getElementById('nav');
const toast = document.getElementById('toast');

// ===== Helpers =====
function esc(text) {
  const div = document.createElement('div');
  div.textContent = text == null ? '' : text;
  return div.innerHTML;
}

function show(id) { document.getElementById(id).classList.add('open'); }
function hide(id) { document.getElementById(id).classList.remove('open'); }

function formatSize(bytes) {
  if (!bytes) return 'size unknown';
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + 'KB';
  return (bytes / (1024 * 1024)).toFixed(1) + 'MB';
}

function timeAgo(dateString) {
  const seconds = (Date.now() - new Date(dateString).getTime()) / 1000;
  const days = Math.floor(seconds / 86400);
  if (seconds < 3600) return 'just now';
  if (days < 1) return 'today';
  if (days === 1) return '1 day ago';
  if (days < 7) return days + ' days ago';
  if (days < 14) return '1 week ago';
  if (days < 60) return Math.floor(days / 7) + ' weeks ago';
  return new Date(dateString).toLocaleDateString();
}

// ===== Load data from the database =====
async function loadData() {
  grid.innerHTML = '<p class="empty" style="display:block">Loading...</p>';

  const deptRes = await db.from('departments').select('id, name').order('id');
  if (deptRes.error) { showError(deptRes.error); return; }
  departments = deptRes.data;

  const resRes = await db
    .from('resources')
    .select('id, course_code, course_title, level, file_path, file_size, created_at, departments(name)')
    .eq('approved', true)
    .order('created_at', { ascending: false });

  if (resRes.error) { showError(resRes.error); return; }
  allResources = resRes.data;
  render();
}

function showError(error) {
  console.error(error);
  grid.innerHTML = '';
  emptyMsg.textContent = 'Could not load resources. Check your internet and try again.';
  emptyMsg.style.display = 'block';
}

// ===== Render =====
function render() {
  const query = searchInput.value.toLowerCase().trim();

  const list = allResources.filter(r => {
    const matchesText = r.course_code.toLowerCase().includes(query) || r.course_title.toLowerCase().includes(query);
    const matchesDept = selectedDept === 'ALL' || r.departments.name === selectedDept;
    return matchesText && matchesDept;
  });

  grid.innerHTML = list.map(r => `
    <article class="resource-card">
      <div class="pdf-badge"><span class="pdf-icon">PDF</span> PDF</div>
      <h3>${esc(r.course_code)} - ${esc(r.course_title)}.pdf</h3>
      <p class="resource-meta">${esc(r.departments.name)} • Level ${esc(r.level)} • Uploaded ${timeAgo(r.created_at)} • ${formatSize(r.file_size)}</p>
      <button class="btn" onclick="download(${r.id})">Download</button>
    </article>
  `).join('');

  emptyMsg.textContent = 'No resources found. Try another search.';
  emptyMsg.style.display = list.length === 0 ? 'block' : 'none';
  clearBtn.style.display = selectedDept !== 'ALL' ? 'inline' : 'none';

  document.querySelectorAll('.dept-card').forEach(card => {
    card.classList.toggle('active', card.dataset.dept === selectedDept);
  });

  // ===== Update Department Card Counts Dynamically =====
  const deptCounts = {};
  allResources.forEach(r => {
    const dName = r.departments?.name;
    if (dName) {
      deptCounts[dName] = (deptCounts[dName] || 0) + 1;
    }
  });

  document.querySelectorAll('.dept-card').forEach(card => {
    const deptName = card.dataset.dept;
    const count = deptCounts[deptName] || 0;
    const pTag = card.querySelector('p');

    if (count > 0) {
      pTag.textContent = `${count} resource${count === 1 ? '' : 's'} • L100-L400`;
    } else {
      pTag.textContent = 'Coming soon • L100-L400';
    }
  });
}

// ===== Filters =====
function filterByDept(dept) {
  selectedDept = dept;
  render();
  document.getElementById('resources').scrollIntoView();
}

function clearFilter() {
  selectedDept = 'ALL';
  searchInput.value = '';
  render();
}

// ===== Download (increments count & opens file) =====
async function download(id) {
  const r = allResources.find(item => item.id === id);
  if (!r.file_path) {
    showToast('This file has not been uploaded yet.');
    return;
  }

  // 1. Increment download count securely via Supabase RPC
  const { error } = await db.rpc('increment_downloads', { resource_id: Number(id) });
  if (error) {
    console.error('Could not update download count:', error);
  }

  // 2. Fetch the public URL and open it
  const result = db.storage.from('resources').getPublicUrl(r.file_path);
  window.open(result.data.publicUrl, '_blank');
}

// ===== Login =====
async function signInWithGoogle() {
  sessionStorage.setItem('afterLogin', 'upload');
  const { error } = await db.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + window.location.pathname }
  });
  if (error) {
    console.error(error);
    showToast('Could not start Google sign-in.');
  }
}

async function signOut() {
  await db.auth.signOut();
  currentProfile = null;
  showToast('Signed out.');
}

function closeLogin() { hide('login-modal'); }
function closeProfile() { hide('profile-modal'); }

// Show a "Sign out" link in the menu only when logged in
function updateAuthUI(session) {
  let link = document.getElementById('signout-link');
  if (session && !link) {
    link = document.createElement('a');
    link.id = 'signout-link';
    link.href = '#';
    link.textContent = 'Sign out';
    link.onclick = function (e) { e.preventDefault(); signOut(); };
    nav.appendChild(link);
  } else if (!session && link) {
    link.remove();
  }
}

// ===== Upload flow: login -> profile -> upload form =====
async function openModal() {
  nav.classList.remove('open');

  const { data } = await db.auth.getSession();
  const session = data.session;

  // 1. Not logged in -> ask to sign in
  if (!session) {
    show('login-modal');
    return;
  }

  // 2. Logged in but no profile yet -> ask for name + index number
  if (!currentProfile) {
    const res = await db.from('profiles')
      .select('full_name, index_number')
      .eq('id', session.user.id)
      .maybeSingle();
    currentProfile = res.data;
  }

  if (!currentProfile) {
    const meta = session.user.user_metadata || {};
    document.getElementById('pf-name').value = meta.full_name || meta.name || '';
    show('profile-modal');
    return;
  }

  // 3. Ready -> show the upload form
  show('upload-modal');
}

function closeModal() { hide('upload-modal'); }

async function handleProfile(event) {
  event.preventDefault();
  const name = document.getElementById('pf-name').value.trim();
  const index = document.getElementById('pf-index').value.trim();

  if (!/^[0-9]{6,12}$/.test(index)) {
    showToast('Index number should be 6 to 12 digits.');
    return;
  }

  const { data } = await db.auth.getSession();
  if (!data.session) { closeProfile(); show('login-modal'); return; }

  const res = await db.from('profiles').upsert({
    id: data.session.user.id,
    full_name: name,
    index_number: index
  });

  if (res.error) {
    console.error(res.error);
    showToast('Could not save your details. Try again.');
    return;
  }

  currentProfile = { full_name: name, index_number: index };
  closeProfile();
  show('upload-modal');
}

async function handleUpload(event) {
  event.preventDefault();
  const form = event.target;
  const submitBtn = form.querySelector('button[type="submit"]');

  const file = document.getElementById('up-file').files[0];
  if (!file) return;
  if (file.type !== 'application/pdf') { showToast('Please choose a PDF file.'); return; }
  if (file.size > 25 * 1024 * 1024) { showToast('File is too large (max 25MB).'); return; }

  const deptName = document.getElementById('up-dept').value;
  const dept = departments.find(d => d.name === deptName);

  submitBtn.disabled = true;
  submitBtn.textContent = 'Uploading...';

  // 1. Upload the file to storage
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const filePath = Date.now() + '-' + safeName;
  const up = await db.storage.from('resources').upload(filePath, file, { contentType: 'application/pdf' });

  if (up.error) {
    console.error(up.error);
    showToast('Upload failed. Are you signed in? Try again.');
    resetSubmit(submitBtn);
    return;
  }

  // 2. Save the details (starts as NOT approved; uploader_id is set by the database)
  const ins = await db.from('resources').insert({
    department_id: dept.id,
    course_code: document.getElementById('up-code').value.trim(),
    course_title: document.getElementById('up-title').value.trim(),
    level: document.getElementById('up-level').value,
    file_path: filePath,
    file_size: file.size,
    uploader_name: currentProfile ? currentProfile.full_name : null,
    approved: false
  });

  resetSubmit(submitBtn);

  if (ins.error) {
    console.error(ins.error);
    const limit = ins.error.message && ins.error.message.includes('limit');
    showToast(limit ? 'Upload limit reached (10 per day).' : 'Could not save details. Try again.');
    return;
  }

  form.reset();
  closeModal();
  showToast('Thanks! Your file will appear once it is reviewed.');
}

function resetSubmit(btn) {
  btn.disabled = false;
  btn.textContent = 'Submit';
}

// ===== Mobile menu =====
function toggleMenu() {
  nav.classList.toggle('open');
}

// ===== Toast =====
function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3500);
}

// ===== Start =====
db.auth.onAuthStateChange(function (event, session) {
  updateAuthUI(session);
});

async function init() {
  loadData();
  const { data } = await db.auth.getSession();
  updateAuthUI(data.session);

  // Came back from Google? Continue to the upload flow.
  if (data.session && sessionStorage.getItem('afterLogin') === 'upload') {
    sessionStorage.removeItem('afterLogin');
    openModal();
  }
}

init();