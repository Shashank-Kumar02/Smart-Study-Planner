// app.js - Smart Study Planner (LocalStorage)
const STORAGE_KEY = 'smart_study_planner_tasks_v1';

let tasks = [];
let editId = null;
const els = {
  form: document.getElementById('taskForm'),
  title: document.getElementById('title'),
  subject: document.getElementById('subject'),
  dueDate: document.getElementById('dueDate'),
  priority: document.getElementById('priority'),
  estHours: document.getElementById('estHours'),
  reminderMins: document.getElementById('reminderMins'),
  clearBtn: document.getElementById('clearBtn'),
  listView: document.getElementById('listView'),
  timelineView: document.getElementById('timelineView'),
  timelineInner: document.getElementById('timelineInner'),
  toggleViewBtn: document.getElementById('toggleViewBtn'),
  search: document.getElementById('search'),
  filterSelect: document.getElementById('filterSelect'),
  sortSelect: document.getElementById('sortSelect'),
  totalTasks: document.getElementById('totalTasks'),
  completedTasks: document.getElementById('completedTasks'),
  upcomingTasks: document.getElementById('upcomingTasks'),
  exportBtn: document.getElementById('exportBtn'),
  importBtn: document.getElementById('importBtn'),
  importFile: document.getElementById('importFile'),
  clearAll: document.getElementById('clearAll')
};

// util
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2,8);
const save = ()=> localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
const load = ()=> JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
const formatDate = d => new Date(d).toLocaleString();
const now = ()=> new Date().getTime();

// Load tasks and initialize
function init(){
  tasks = load();
  render();
  scheduleRemindersForAll();
  requestNotificationPermission();
}
function requestNotificationPermission(){
  if(!('Notification' in window)) return;
  if(Notification.permission === 'default') Notification.requestPermission();
}

// Form submit
els.form.addEventListener('submit', e=>{
  e.preventDefault();
  const data = {
    id: editId || uid(),
    title: els.title.value.trim(),
    subject: els.subject.value.trim(),
    due: els.dueDate.value ? new Date(els.dueDate.value).getTime() : null,
    priority: els.priority.value,
    estHours: els.estHours.value ? Number(els.estHours.value) : null,
    reminderMins: els.reminderMins.value ? Number(els.reminderMins.value) : 0,
    created: now(),
    completed: false,
    progress: 0
  };
  if(!data.title){ alert('Please enter a goal title'); return; }
  if(editId){
    const idx = tasks.findIndex(t=>t.id===editId);
    tasks[idx] = {...tasks[idx], ...data, id: editId, created: tasks[idx].created};
    editId = null;
  } else {
    tasks.push(data);
  }
  save();
  render();
  els.form.reset();
  scheduleReminderForTask(data);
});

els.clearBtn.addEventListener('click', ()=>{
  editId = null; els.form.reset();
});

// Render functions
function render(){
  const q = els.search.value.trim().toLowerCase();
  const filter = els.filterSelect.value;
  const sort = els.sortSelect.value;
  let list = [...tasks];

  // Filtering
  if(filter === 'completed') list = list.filter(t=>t.completed);
  if(filter === 'incomplete') list = list.filter(t=>!t.completed);
  if(filter === 'today') {
    const start = new Date(); start.setHours(0,0,0,0);
    const end = new Date(); end.setHours(23,59,59,999);
    list = list.filter(t=>t.due && t.due>=start.getTime() && t.due<=end.getTime());
  }
  if(filter === 'high') list = list.filter(t=>t.priority==='high');

  // Search
  if(q) list = list.filter(t=> (t.title+t.subject).toLowerCase().includes(q) );

  // Sort
  if(sort==='dueAsc') list.sort((a,b)=> (a.due||1e15)-(b.due||1e15));
  if(sort==='dueDesc') list.sort((a,b)=> (b.due||0)-(a.due||0));
  if(sort==='priority') list.sort((a,b)=> priorityRank(b.priority)-priorityRank(a.priority));
  if(sort==='created') list.sort((a,b)=> b.created - a.created);

  // Update stats
  els.totalTasks.textContent = tasks.length;
  els.completedTasks.textContent = tasks.filter(t=>t.completed).length;
  els.upcomingTasks.textContent = tasks.filter(t=>t.due && t.due - now() < 1000*60*60*24 && !t.completed).length;

  // List view
  els.listView.innerHTML = '';
  if(list.length===0) els.listView.innerHTML = '<div class="task-card"><div class="task-left">No goals yet — add one from the form above.</div></div>';
  list.forEach(t=>{
    const card = document.createElement('div'); card.className='task-card';
    card.innerHTML = `
      <div class="task-left">
        <div class="task-title">${escapeHtml(t.title)} <span style="font-weight:400;color:var(--muted)">${t.subject? ' • '+escapeHtml(t.subject):''}</span></div>
        <div class="meta">
          <div class="priority ${t.priority}">${t.priority}</div>
          <div class="countdown">${t.due? formatDate(t.due): 'No due date'}</div>
          <div style="margin-left:8px;color:var(--muted)">Est ${t.estHours? t.estHours+'h':''}</div>
        </div>
        <div class="progress-row">
          <div class="progress"><i style="width:${t.progress||0}%"></i></div>
          <div style="min-width:48px;text-align:right">${t.progress||0}%</div>
        </div>
      </div>
      <div class="task-actions">
        <button class="small-btn" data-action="complete" data-id="${t.id}">${t.completed? '☑️' : '⬜'}</button>
        <button class="small-btn" data-action="edit" data-id="${t.id}">Edit</button>
        <button class="small-btn" data-action="delete" data-id="${t.id}">Delete</button>
      </div>
    `;
    els.listView.appendChild(card);
  });

  // attach action handlers
  els.listView.querySelectorAll('[data-action]').forEach(btn=>btn.addEventListener('click', e=>{
    const id = e.currentTarget.dataset.id; const action = e.currentTarget.dataset.action;
    if(action==='complete') toggleComplete(id);
    if(action==='edit') startEdit(id);
    if(action==='delete') removeTask(id);
  }));

  renderTimeline(list);
}

function priorityRank(p){
  return p==='high'?3: p==='medium'?2:1;
}
function escapeHtml(s){ return (s+'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// Toggle complete
function toggleComplete(id){
  const t = tasks.find(x=>x.id===id); if(!t) return;
  t.completed = !t.completed; save(); render();
}

// Edit
function startEdit(id){
  const t = tasks.find(x=>x.id===id); if(!t) return;
  editId = id;
  els.title.value = t.title;
  els.subject.value = t.subject || '';
  els.priority.value = t.priority || 'medium';
  els.estHours.value = t.estHours || '';
  els.reminderMins.value = t.reminderMins || '';
  els.dueDate.value = t.due? new Date(t.due).toISOString().slice(0,16) : '';
  window.scrollTo({top:0,behavior:'smooth'});
}

// Delete
function removeTask(id){
  if(!confirm('Delete this goal?')) return;
  tasks = tasks.filter(t=>t.id!==id);
  save(); render();
}

// Timeline view render
function renderTimeline(list){
  const inner = els.timelineInner;
  inner.innerHTML='';
  if(list.length===0){ inner.innerHTML = '<div style="color:var(--muted)">No goals to show on the timeline</div>'; return; }
  // Determine date range
  const dated = list.filter(t=>t.due).sort((a,b)=>a.due-b.due);
  if(dated.length===0){
    // fallback: evenly space items
    list.forEach((t,i)=>{
      const el = document.createElement('div'); el.className='timeline-item';
      el.style.left = (10 + i*(80/(list.length||1))) + '%';
      el.innerHTML = `<strong>${escapeHtml(t.title)}</strong><div class="countdown">${t.due? formatDate(t.due): 'No date'}</div>`;
      inner.appendChild(el);
    });
    return;
  }
  const start = dated[0].due;
  const end = dated[dated.length-1].due || start+1;
  const span = Math.max(1, end - start);
  list.forEach(t=>{
    const el = document.createElement('div'); el.className='timeline-item';
    const left = t.due? ((t.due - start) / span) * 96 + 2 : 50;
    el.style.left = left + '%';
    el.innerHTML = `<strong>${escapeHtml(t.title)}</strong><div class="countdown">${t.due? formatDate(t.due): 'No date'}</div>`;
    el.classList.add(t.priority || 'medium');
    inner.appendChild(el);
  });
}

// Reminders
let scheduledTimeouts = {};
function scheduleReminderForTask(task){
  try {
    if(!task.due || !task.reminderMins) return;
    const when = task.due - task.reminderMins*60000;
    const ms = when - now();
    if(ms <= 0) return; // skip past reminders
    if(scheduledTimeouts[task.id]) clearTimeout(scheduledTimeouts[task.id]);
    scheduledTimeouts[task.id] = setTimeout(()=>{
      showNotification(`Reminder: ${task.title}`, `Due ${new Date(task.due).toLocaleString()}`);
    }, ms);
  } catch(e){ console.error(e); }
}
function scheduleRemindersForAll(){
  Object.values(scheduledTimeouts).forEach(t=>clearTimeout(t)); scheduledTimeouts = {};
  tasks.forEach(scheduleReminderForTask);
}
function showNotification(title, body){
  if('Notification' in window && Notification.permission==='granted') new Notification(title, {body});
  else alert(`${title}\n\n${body}`);
}

// Notifications ask
document.addEventListener('visibilitychange', ()=>{
  if(document.visibilityState==='visible') scheduleRemindersForAll();
});

// Search/filters
els.search.addEventListener('input', render);
els.filterSelect.addEventListener('change', render);
els.sortSelect.addEventListener('change', render);

// Toggle view
els.toggleViewBtn.addEventListener('click', ()=>{
  const isHidden = els.timelineView.classList.contains('hidden');
  if(isHidden){
    els.timelineView.classList.remove('hidden');
    els.toggleViewBtn.textContent='List';
  } else {
    els.timelineView.classList.add('hidden');
    els.toggleViewBtn.textContent='Timeline';
  }
});

// Export / Import
els.exportBtn.addEventListener('click', ()=>{
  const data = JSON.stringify(tasks, null, 2);
  const blob = new Blob([data], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download='study-planner-backup.json'; a.click();
  URL.revokeObjectURL(url);
});
els.importBtn.addEventListener('click', ()=> els.importFile.click());
els.importFile.addEventListener('change', async(e)=>{
  const f = e.target.files[0]; if(!f) return;
  const txt = await f.text();
  try{
    const arr = JSON.parse(txt);
    if(Array.isArray(arr)){ tasks = arr; save(); render(); scheduleRemindersForAll(); alert('Import successful'); }
    else alert('Invalid file');
  } catch(err){ alert('Failed to import: '+err.message); }
});

// Clear all
els.clearAll.addEventListener('click', ()=>{
  if(!confirm('Clear all goals and data?')) return;
  tasks = []; save(); render();
});

// schedule reminders for existing tasks when page loads
function scheduleRemindersForAllOnLoad(){
  tasks.forEach(t=> scheduleReminderForTask(t));
}

// small utility to update progress via click (bonus)
els.listView.addEventListener('dblclick', e=>{
  // double-click a card to increase progress by 10%
  const card = e.target.closest('.task-card');
  if(!card) return;
  const idBtn = card.querySelector('[data-id]');
  if(!idBtn) return;
  const id = idBtn.dataset.id;
  const t = tasks.find(x=>x.id===id); if(!t) return;
  t.progress = Math.min(100, (t.progress||0) + 10);
  if(t.progress===100) t.completed = true;
  save(); render();
});

// initial
init();

// ... (existing code stays same)

// Book Recommendations
const books = [
  {title:"Atomic Habits", author:"James Clear", img:"https://images-na.ssl-images-amazon.com/images/I/81bGKUa1e0L.jpg"},
  {title:"Deep Work", author:"Cal Newport", img:"https://miro.medium.com/v2/resize:fit:554/1*YZF_fJ0_SAKAinV8hav55Q.jpeg"},
  {title:"The Power of Habit", author:"Charles Duhigg", img:"https://cdn.grofers.com/da/cms-assets/cms/product/c6100f6a-9c39-461e-93c8-a7bb2477b6a3.jpg"},
  {title:"Mindset", author:"Carol Dweck", img:"https://images-na.ssl-images-amazon.com/images/I/81u+jLjLHgL.jpg"}
];
function renderBooks(){
  const bookList = document.getElementById('bookList');
  bookList.innerHTML="";
  books.forEach(b=>{
    const div=document.createElement('div');
    div.className="book-card";
    div.innerHTML=`<img src="${b.img}" alt="${b.title}"><h4>${b.title}</h4><p>${b.author}</p>`;
    bookList.appendChild(div);
  });
}

// Quotes
const quotes = [
  "Stay positive, work hard, make it happen.",
  "Success is the sum of small efforts repeated day in and day out.",
  "Don’t watch the clock; do what it does. Keep going.",
  "Focus on progress, not perfection."
];
function rotateQuotes(){
  const q = document.getElementById('quoteBox');
  let i=0;
  setInterval(()=>{
    q.textContent=quotes[i%quotes.length];
    i++;
  },5000);
}

// Dark Mode Toggle
document.getElementById('darkModeToggle').addEventListener('click',()=>{
  document.documentElement.classList.toggle('dark');
});

// Init extra
window.addEventListener('DOMContentLoaded', ()=>{
  renderBooks();
  rotateQuotes();
});
