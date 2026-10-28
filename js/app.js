// ===== State =====
let selectedDept = 'ALL';

// ===== Elements =====
const grid = document.getElementById('resource-grid');
const emptyMsg = document.getElementById('empty');
const searchInput = document.getElementById('search-input');
const clearBtn = document.getElementById('clear-filter');
const nav = document.getElementById('nav');
const modal = document.getElementById('upload-modal');
const toast = document.getElementById('toast');

// Escape text so user input can't inject HTML
function esc(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ===== Render =====
function render() {
  const query = searchInput.value.toLowerCase().trim();

  const list = resources.filter(r => {
    const matchesText = r.code.toLowerCase().includes(query) || r.title.toLowerCase().includes(query);
    const matchesDept = selectedDept === 'ALL' || r.dept === selectedDept;
    return matchesText && matchesDept;
  });

  grid.innerHTML = list.map(r => `
    <article class="resource-card">
      <div class="pdf-badge"><span class="pdf-icon">PDF</span> PDF</div>
      <h3>${esc(r.code)} - ${esc(r.title)}.pdf</h3>
      <p class="resource-meta">${esc(r.dept)} • Level ${esc(r.level)} • Uploaded ${esc(r.uploaded)} • ${esc(r.size)}</p>
      <button class="btn" onclick="download(${r.id})">Download</button>
    </article>
  `).join('');

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

// ===== Download (placeholder) =====
function download(id) {
  const r = resources.find(item => item.id === id);
  showToast('Downloading ' + r.code + ' - ' + r.title + '.pdf (placeholder)');
}

// ===== Upload modal =====
function openModal() {
  modal.classList.add('open');
  nav.classList.remove('open');
}

function closeModal() {
  modal.classList.remove('open');
}

function handleUpload(event) {
  event.preventDefault();
  const code = document.getElementById('up-code').value.trim();
  const title = document.getElementById('up-title').value.trim();

  resources.unshift({
    id: Date.now(),
    code: code,
    title: title,
    dept: document.getElementById('up-dept').value,
    level: document.getElementById('up-level').value,
    size: '1.0MB',
    uploaded: 'just now'
  });

  event.target.reset();
  closeModal();
  render();
  showToast('Added (placeholder, not saved yet)');
}

// ===== Mobile menu =====
function toggleMenu() {
  nav.classList.toggle('open');
}

// ===== Toast =====
function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

// ===== Start =====
render();