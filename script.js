document.addEventListener('DOMContentLoaded', async () => {
  // Markdown-it for rendering post content
  const md = window.markdownit({ html: false, linkify: true, typographer: true });
  let currentUser = null;
  let currentThreadId = null;
  let currentCategoryId = null;

  // Elements
  const categoryList = document.getElementById('categoryList');
  const threadList = document.getElementById('threadList');
  const postList = document.getElementById('postList');
  const threadsPanel = document.getElementById('threads');
  const postsPanel = document.getElementById('posts');
  const newThreadTitle = document.getElementById('newThreadTitle');
  const newThreadContent = document.getElementById('newThreadContent');
  const categorySelect = document.getElementById('categorySelect');
  const createThreadBtn = document.getElementById('createThreadBtn');
  const replyBox = document.getElementById('replyBox');
  const sendReplyBtn = document.getElementById('sendReplyBtn');
  const backToThreads = document.getElementById('backToThreads');
  const userNameSpan = document.getElementById('userName');

  /* ----------------- Helpers ----------------- */
  function showAuthUI() {
    document.querySelectorAll('.auth-only').forEach(el => {
      el.style.display = currentUser ? 'block' : 'none';
    });
    document.querySelectorAll('.guest-only').forEach(el => {
      el.style.display = currentUser ? 'none' : 'block';
    });
    if (currentUser) userNameSpan.textContent = `Hi, ${currentUser.displayName}`;
  }

  /* ----------------- Load User ----------------- */
  async function loadUser() {
    try {
      const res = await fetch('/api/me');
      if (!res.ok) throw new Error('Failed to fetch user');
      const data = await res.json();
      currentUser = data.user || null;
      showAuthUI();
    } catch (err) {
      currentUser = null;
      showAuthUI();
      alert('Error loading user: ' + err);
    }
  }

  /* ----------------- Categories ----------------- */
  async function loadCategories() {
    const res = await fetch('/api/categories');
    const data = await res.json();
    categoryList.innerHTML = '';
    categorySelect.innerHTML = '';
    data.categories.forEach(cat => {
      const li = document.createElement('li');
      li.textContent = cat.name;
      li.dataset.id = cat.id;
      li.addEventListener('click', () => {
        currentCategoryId = cat.id;
        loadThreads(cat.id);
      });
      categoryList.appendChild(li);

      const opt = document.createElement('option');
      opt.value = cat.id;
      opt.textContent = cat.name;
      categorySelect.appendChild(opt);
    });
  }

  /* ----------------- Threads ----------------- */
  async function loadThreads(categoryId = null) {
    currentCategoryId = categoryId;
    const url = categoryId ? `/api/threads?categoryId=${categoryId}` : '/api/threads';
    const res = await fetch(url);
    const data = await res.json();

    threadList.innerHTML = '';
    postList.innerHTML = '';
    postsPanel.classList.add('hidden');
    threadsPanel.classList.remove('hidden');

    // Show "Back to all threads" if in category
    if (categoryId) {
      const backLi = document.createElement('li');
      backLi.textContent = '← Back to all threads';
      backLi.style.fontWeight = 'bold';
      backLi.addEventListener('click', () => loadThreads());
      threadList.appendChild(backLi);
    }

    data.threads.forEach(thread => {
      const li = document.createElement('li');
      li.innerHTML = `<strong>${thread.title}</strong><br>
                      By: ${thread.author.displayName} | ${new Date(thread.updatedAt).toLocaleString()}`;
      li.dataset.id = thread.id;
      li.addEventListener('click', () => loadThreadPosts(thread.id));
      threadList.appendChild(li);
    });
  }

  createThreadBtn?.addEventListener('click', async () => {
    const title = newThreadTitle.value.trim();
    const content = newThreadContent.value.trim();
    const categoryId = categorySelect.value;
    if (!title || !content) {
      alert('Please fill all fields');
      return;
    }
    try {
      const res = await fetch('/api/threads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content, categoryId })
      });
      if (!res.ok) {
        const errorText = await res.text();
        alert('Error creating thread: ' + errorText);
        return;
      }
      const data = await res.json();
      if (data.threadId) {
        newThreadTitle.value = '';
        newThreadContent.value = '';
        loadThreads(currentCategoryId);
      } else {
        alert('Error: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      alert('Network or server error: ' + err);
      console.error('Create thread error:', err);
    }
  });

  /* ----------------- Posts ----------------- */
  async function loadThreadPosts(threadId) {
    const res = await fetch(`/api/threads/${threadId}`);
    const data = await res.json();
    currentThreadId = threadId;

    postList.innerHTML = '';
    threadsPanel.classList.add('hidden');
    postsPanel.classList.remove('hidden');

    // Always show thread header (title, author, date)
    const threadHeader = document.createElement('div');
    threadHeader.innerHTML = `<h2>${data.thread.title || 'Untitled'}</h2>
      <strong>${data.thread.author ? data.thread.author.displayName : 'Unknown'}</strong><br>
      <small>${data.thread.createdAt ? new Date(data.thread.createdAt).toLocaleString() : ''}</small><hr>`;
    postList.appendChild(threadHeader);

    // Main post: first post in posts array
    const mainPostDiv = document.createElement('div');
    mainPostDiv.className = 'main-post';
    if (data.posts && data.posts.length > 0) {
      const first = data.posts[0];
      const renderedHtml = first.content ? md.render(first.content) : '<em>(empty)</em>';
      mainPostDiv.innerHTML = `<div><strong>Raw content:</strong> ${first.content ? first.content : '<em>(empty)</em>'}</div>
        <div><strong>Rendered HTML:</strong> ${renderedHtml}</div><hr>`;
    } else {
      mainPostDiv.innerHTML = `<em>No content</em><hr>`;
    }
    postList.appendChild(mainPostDiv);

    // Replies: all posts except the first
    const replies = data.posts && data.posts.length > 1 ? data.posts.slice(1) : [];
    if (replies.length > 0) {
      const repliesHeader = document.createElement('h3');
      repliesHeader.textContent = 'Replies';
      postList.appendChild(repliesHeader);
      replies.forEach(p => {
        const replyDiv = document.createElement('div');
        replyDiv.className = 'reply-post';
        const replyHtml = p.content ? md.render(p.content) : '<em>(empty)</em>';
        replyDiv.innerHTML = `<div style="padding:6px 0;"><strong>${p.author.displayName}</strong><br>
          ${replyHtml}<br>
          <small>${new Date(p.createdAt).toLocaleString()}</small></div><hr>`;
        postList.appendChild(replyDiv);
      });
    } else {
      const noReplies = document.createElement('div');
      noReplies.innerHTML = '<em>No replies yet.</em>';
      postList.appendChild(noReplies);
    }
  }

  sendReplyBtn?.addEventListener('click', async () => {
    const content = replyBox.value.trim();
    if (!content) return;
    const res = await fetch(`/api/threads/${currentThreadId}/posts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content })
    });
    const data = await res.json();
    if (data.postId) {
      replyBox.value = '';
      // Reload thread to show new reply
      await loadThreadPosts(currentThreadId);
    } else alert(data.error);
  });

  backToThreads?.addEventListener('click', () => {
    postsPanel.classList.add('hidden');
    threadsPanel.classList.remove('hidden');
    loadThreads(currentCategoryId);
  });

  /* ----------------- Auth ----------------- */
  document.getElementById('registerBtn')?.addEventListener('click', async () => {
    const email = document.getElementById('regEmail').value.trim();
    const displayName = document.getElementById('regDisplayName').value.trim();
    const password = document.getElementById('regPassword').value.trim();
    if (!email || !displayName || !password) return alert('Fill all fields');
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, displayName, password })
    });
    const data = await res.json();
    if (data.ok) {
      currentUser = data.user;
      showAuthUI();
      await loadUser();
      loadThreads();
      loadCategories();
    } else alert(data.error);
  });

  document.getElementById('loginBtn')?.addEventListener('click', async () => {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value.trim();
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (data.ok) {
      currentUser = data.user;
      showAuthUI();
      await loadUser();
      loadThreads();
      loadCategories();
    } else alert(data.error);
  });

  document.getElementById('logoutBtn')?.addEventListener('click', async () => {
    await fetch('/api/logout', { method: 'POST' });
    currentUser = null;
    showAuthUI();
    loadThreads();
  });

  /* ----------------- Init ----------------- */
  await loadUser();
  await loadCategories();
  loadThreads();
});
