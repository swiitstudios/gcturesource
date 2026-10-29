// ===== Supabase client =====
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ===== State =====
let allResources = [];     // approved resources from the database
let departments = [];   // [{id, name}]
let selectedDept = 'ALL';

// ===== Elements =====
const grid = document.getElementById('resource-grid');
const emptyMsg = document.getElementById('empty');
const searchInput = document.getElementById('search-input');
const clearBtn = document.getElementById('clear-filter');
const nav = document.getElementById('nav');
const modal = document.getElementById('upload-modal');
const toast = document.getElementById('toast');

// ===== Helpers =====
function esc(text) {
  const div = document.createElement('div');
  div.textContent = text == null ? '' : text;
  return div.innerHTML;
}

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

// ===== Download =====
function download(id) {
  const r = allResources.find(item => item.id === id);
  if (!r.file_path) {
    showToast('This file has not been uploaded yet.');
    return;
  }
  const result = db.storage.from('resources').getPublicUrl(r.file_path);
  window.open(result.data.publicUrl, '_blank');
}

// ===== Upload =====
function openModal() {
  modal.classList.add('open');
  nav.classList.remove('open');
}

function closeModal() {
  modal.classList.remove('open');
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

  // 1. Upload the file to storage (random-ish safe file name)
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const filePath = Date.now() + '-' + safeName;
  const up = await db.storage.from('resources').upload(filePath, file, { contentType: 'application/pdf' });

  if (up.error) {
    console.error(up.error);
    showToast('Upload failed. Try again.');
    resetSubmit(submitBtn);
    return;
  }

  // 2. Save the details (starts as NOT approved)
  const ins = await db.from('resources').insert({
    department_id: dept.id,
    course_code: document.getElementById('up-code').value.trim(),
    course_title: document.getElementById('up-title').value.trim(),
    level: document.getElementById('up-level').value,
    file_path: filePath,
    file_size: file.size,
    uploader_name: document.getElementById('up-name').value.trim() || null,
    approved: false
  });

  resetSubmit(submitBtn);

  if (ins.error) {
    console.error(ins.error);
    showToast('Could not save details. Try again.');
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
loadData();