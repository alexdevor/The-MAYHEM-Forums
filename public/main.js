// Dark/Light mode switch
function setMode(mode) {
	document.body.classList.toggle('dark', mode === 'dark');
	localStorage.setItem('siteMode', mode);
	document.getElementById('mode-switch').textContent = mode === 'dark' ? '☀️' : '🌙';
}

document.getElementById('mode-switch').onclick = function() {
	const current = document.body.classList.contains('dark') ? 'dark' : 'light';
	setMode(current === 'dark' ? 'light' : 'dark');
};

// On load, set mode from localStorage
setMode(localStorage.getItem('siteMode') || 'light');
function showAlert(message, type = 'info', timeout = 3000) {
	const container = document.getElementById('alert-container');
	if (!container) return;
	const alert = document.createElement('div');
	alert.className = 'alert';
	alert.textContent = message;
	container.appendChild(alert);
	setTimeout(() => {
		alert.style.opacity = '0';
		setTimeout(() => container.removeChild(alert), 400);
	}, timeout);

}

let token = localStorage.getItem('token') || '';
let currentUser = null;

function show(page) {
    document.getElementById('main-content').innerHTML = page;
}

function renderThread(thread) {
    let img = thread.image ? `<img src='${thread.image}' style='max-width:200px;'>` : '';
    let replies = renderReplies(thread.replies || []);
    let created = thread.created_at_formatted ? `<span class='date'>Posted: ${thread.created_at_formatted}</span>` : '';
    let updated = thread.updated_at_formatted ? `<span class='date'>Updated: ${thread.updated_at_formatted}</span>` : '';
    let adminBtns = '';
    let pfp = thread.pfp ? `<img src='${thread.pfp}' class='pfp'>` : `<span class='pfp pfp-placeholder'>${thread.username[0].toUpperCase()}</span>`;
    let verified = thread.role === 'admin' ? `<img class='admin-verified' src='https://upload.wikimedia.org/wikipedia/commons/thumb/e/e4/Twitter_Verified_Badge.svg/768px-Twitter_Verified_Badge.svg.png' alt='Verified Admin' title='Verified Admin'>` : '';
    let tags = thread.tags ? `<span class='tags'>${thread.tags.split(',').map(t => `<span class='tag'>${t.trim()}</span>`).join(' ')}</span>` : '';
    let pinBtn = '';
    let pinnedLabel = thread.pinned == 1 ? `<span class='pinned-label'>📌 Pinned Thread</span>` : '';
    
    if (currentUser && currentUser.role === 'admin') {
        pinBtn = thread.pinned == 1 ? `<button class='admin-action-btn' onclick="unpinThread(${thread.id})">Unpin</button>` : `<button class='admin-action-btn' onclick="pinThread(${thread.id})">Pin</button>`;
        adminBtns = `${pinBtn} <button class='admin-action-btn' onclick="showEditThreadForm(${thread.id}, '${encodeURIComponent(thread.title)}', '${encodeURIComponent(thread.content)}')">Edit</button> <button class='admin-action-btn' onclick="showDeleteThreadConfirm(${thread.id})">Delete</button>`;
    }
    
    return `<div class='thread'><div class='user'>${pfp}<strong><a href='#user-${thread.user_id}' style='text-decoration:none;color:inherit;'>${thread.username}</a></strong>${verified}${pinnedLabel}</div><h2>${thread.title}</h2>${tags}<div>${thread.content}</div>${img}<div>${created} ${updated}</div>${adminBtns}${replies}<button onclick="showReplyForm(${thread.id},null)">Reply</button></div>`;
}

function fetchThreads() {
    show('<p>Loading threads...</p>');
    fetch('/api/threads', {
        headers: token ? { Authorization: 'Bearer ' + token } : {}
    })
        .then(res => {
            if (!res.ok) throw new Error('Server returned ' + res.status);
            return res.json();
        })
        .then(threads => {
            // Restore currentUser from JWT if available
            if (token) {
                try {
                    const payload = JSON.parse(atob(token.split('.')[1]));
                    currentUser = { id: payload.id, username: payload.username, role: payload.role };
                } catch (e) {
                    console.error('Error parsing JWT:', e);
                }
            }
            
            let html = `<button onclick="showThreadForm()">New Thread</button>`;
            
            if (!Array.isArray(threads)) {
                throw new Error('Invalid response format');
            }
            
            if (threads.length === 0) {
                html += '<p>No threads yet. Be the first to post!</p>';
            } else {
                // Sort threads: pinned first, then by created_at DESC
                threads.sort((a, b) => {
                    if ((a.pinned ? 1 : 0) !== (b.pinned ? 1 : 0)) return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
                    return new Date(b.created_at) - new Date(a.created_at);
                });
                threads.forEach(thread => {
                    try {
                        html += renderThread(thread);
                    } catch (e) {
                        console.error('Error rendering thread:', e, thread);
                    }
                });
            }
            show(html);
            updateNav();
        })
        .catch(err => {
            console.error('Error fetching threads:', err);
            show(`<p>Error loading threads: ${err.message}</p><button onclick="fetchThreads()">Retry</button>`);
            updateNav();
        });
}

function renderReplies(replies) {
    return replies.map(reply => {
        let adminBtns = '';
        if (currentUser && currentUser.role === 'admin') {
            adminBtns = `<button class='admin-action-btn' onclick="showEditReplyForm(${reply.id}, '${encodeURIComponent(reply.content)}')">Edit</button> <button class='admin-action-btn' onclick="showDeleteReplyConfirm(${reply.id})">Delete</button>`;
        }
        let pfp = reply.pfp ? `<img src='${reply.pfp}' class='pfp'>` : `<span class='pfp pfp-placeholder'>${reply.username[0].toUpperCase()}</span>`;
        let verified = reply.role === 'admin' ? `<img class='admin-verified' src='https://upload.wikimedia.org/wikipedia/commons/thumb/e/e4/Twitter_Verified_Badge.svg/768px-Twitter_Verified_Badge.svg.png' alt='Verified Admin' title='Verified Admin'>` : '';
        let created = reply.created_at ? `<span class='date'>${new Date(reply.created_at).toLocaleString()}</span>` : '';
        return `<div class='reply'><div class='user'>${pfp}<strong>${reply.username}</strong>${verified}${created}</div><p>${reply.content}</p>${adminBtns}${renderReplies(reply.children || [])}<button onclick="showReplyForm(${reply.thread_id},${reply.id})">Reply</button></div>`;
    }).join('');
}
function showEditThreadForm(id, title, content) {
  show(`<form id='editThreadForm'><input name='title' value='${decodeURIComponent(title)}'><br><textarea name='content'>${decodeURIComponent(content)}</textarea><br><button type='submit'>Publish Edit</button> <button type='button' onclick='fetchThreads()'>Cancel</button></form>`);
  document.getElementById('editThreadForm').onsubmit = function(e) {
	e.preventDefault();
	fetch('/api/admin/thread/' + id, {
	  method: 'PUT',
	  headers: {
		'Content-Type': 'application/json',
		Authorization: 'Bearer ' + token
	  },
	  body: JSON.stringify({ title: e.target.title.value, content: e.target.content.value })
	})
	  .then(res => res.json())
	  .then(res => {
		if (res.success) {
		  fetchThreads();
            showAlert('Thread updated!', 'success');
        } else {
            showAlert('Failed to update thread', 'error');
        }
    })
    .catch(() => showAlert('Failed to update thread', 'error'));
    };
}

// Admin: Delete thread
function deleteThread(id) {
	showDeleteThreadConfirm(id);
}

function pinThread(id) {
  fetch('/api/admin/pin/' + id, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token }
  })
    .then(res => res.json())
    .then(res => {
      if (res.success) {
        fetchThreads();
        showAlert('Thread pinned!', 'success');
      } else {
        showAlert('Failed to pin thread', 'error');
      }
    });
}

function unpinThread(id) {
  fetch('/api/admin/unpin/' + id, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token }
  })
    .then(res => res.json())
    .then(res => {
      if (res.success) {
        fetchThreads();
        showAlert('Thread unpinned!', 'success');
      } else {
        showAlert('Failed to unpin thread', 'error');
      }
    })
    .catch(() => showAlert('Failed to unpin thread', 'error'));
}

// Make admin thread/reply actions global for inline onclick
window.pinThread = function(id) {
  fetch('/api/admin/pin/' + id, {
	method: 'POST',
	headers: { Authorization: 'Bearer ' + token }
  })
	.then(res => res.json())
	.then(res => {
	  if (res.success) {
		fetchThreads();
		showAlert('Thread pinned!', 'success');
	  } else {
		showAlert('Failed to pin thread', 'error');
	  }
	})
	.catch(() => showAlert('Failed to pin thread', 'error'));
};
window.unpinThread = function(id) {
  fetch('/api/admin/unpin/' + id, {
	method: 'POST',
	headers: { Authorization: 'Bearer ' + token }
  })
	.then(res => res.json())
	.then(res => {
	  if (res.success) {
		fetchThreads();
		showAlert('Thread unpinned!', 'success');
	  } else {
		showAlert('Failed to unpin thread', 'error');
      }
    })
    .catch(() => showAlert('Failed to unpin thread', 'error'));
}

function showReplyForm(thread_id, parent_reply_id) {
	show(`<form id='replyForm'><textarea name='content' placeholder='Reply'></textarea><input type='hidden' name='thread_id' value='${thread_id}'><input type='hidden' name='parent_reply_id' value='${parent_reply_id || ''}'><br><button type='submit'>Post Reply</button></form>`);
	document.getElementById('replyForm').onsubmit = postReply;
}

function postReply(e) {
		e.preventDefault();
		let form = e.target;
		let data = {
			thread_id: form.thread_id.value,
			parent_reply_id: form.parent_reply_id.value || null,
			content: form.content.value
		};
		fetch('/api/replies', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: 'Bearer ' + token
			},
			body: JSON.stringify(data)
		})
			.then(res => res.json())
			.then(res => {
				if (res.id) {
					fetchThreads();
					showAlert('Reply posted!', 'success');
				} else {
					showAlert('Failed to post reply', 'error');
				}
			})
	.catch(() => showAlert('Failed to post reply', 'error'));
}

function showLoginForm() {
	show(`<form id='loginForm'><input name='username' placeholder='Username'><br><input name='password' type='password' placeholder='Password'><br><button type='submit'>Login</button></form>`);
	document.getElementById('loginForm').onsubmit = login;
}

function login(e) {
		e.preventDefault();
		let form = e.target;
		let data = {
			username: form.username.value,
			password: form.password.value
		};
		fetch('/api/login', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(data)
		})
			.then(res => res.json())
			.then(res => {
				if (res.token) {
					token = res.token;
					localStorage.setItem('token', token);
					currentUser = res.user;
					updateNav();
					fetchThreads();
					showAlert('Login successful!', 'success');
				} else {
					showAlert('Login failed', 'error');
				}
			});
}

function showSignupForm() {
	show(`<form id='signupForm'><input name='username' placeholder='Username'><br><input name='email' placeholder='Email'><br><input name='password' type='password' placeholder='Password'><br><button type='submit'>Sign Up</button></form>`);
	document.getElementById('signupForm').onsubmit = signup;
}

function signup(e) {
		e.preventDefault();
		let form = e.target;
		let data = {
			username: form.username.value,
			email: form.email.value,
			password: form.password.value
		};
		fetch('/api/signup', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(data)
		})
			.then(res => res.json())
			.then(res => {
				if (res.success) {
					showLoginForm();
					showAlert('Signup successful! Please log in.', 'success');
				} else {
					showAlert('Signup failed', 'error');
				}
			});
}

function updateNav() {
	document.getElementById('login-link').style.display = token ? 'none' : '';
	document.getElementById('signup-link').style.display = token ? 'none' : '';
	document.getElementById('profile-link').style.display = token ? '' : 'none';
	document.getElementById('logout-link').style.display = token ? '' : 'none';
	document.getElementById('admin-link').style.display = currentUser && currentUser.role === 'admin' ? '' : 'none';
}

function logout() {
	token = '';
	localStorage.removeItem('token');
	currentUser = null;
	updateNav();
	fetchThreads();
}

// Example badge definitions
const BADGES = [
  {
    name: 'Veteran',
    description: 'Posted 100+ times',
    image: 'https://cdn-icons-png.flaticon.com/512/1828/1828884.png'
  },
  {
    name: 'Moderator',
    description: 'Forum moderator',
    image: 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png'
  },
  {
    name: 'VIP',
    description: 'Special VIP member',
    image: 'https://cdn-icons-png.flaticon.com/512/616/616554.png'
  },
  {
    name: 'Verified',
    description: 'Verified admin',
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e4/Twitter_Verified_Badge.svg/768px-Twitter_Verified_Badge.svg.png'
  }
];

function getUserBadges(user) {
  const badges = [];
  if (user.role === 'admin') badges.push(BADGES.find(b => b.name === 'Verified'));
  if (user.role === 'moderator') badges.push(BADGES.find(b => b.name === 'Moderator'));
  if (user.role === 'VIP') badges.push(BADGES.find(b => b.name === 'VIP'));
  if (user.post_count >= 100) badges.push(BADGES.find(b => b.name === 'Veteran'));
  return badges.filter(Boolean);
}

// Navigation event handlers
document.querySelector('.nav-brand').onclick = function(e) {
    e.preventDefault();
    window.location.hash = '';
    showHomePage();
};

document.getElementById('login-link').onclick = showLoginForm;
document.getElementById('signup-link').onclick = showSignupForm;
document.getElementById('logout-link').onclick = logout;
document.getElementById('profile-link').onclick = function() {
    window.location.hash = '';
    showProfile();
};
document.getElementById('admin-link').onclick = showAdminPanel;
document.getElementById('communities-link').onclick = function(e) {
    e.preventDefault();
    window.location.hash = '#communities';
    showCommunities();
};
document.getElementById('create-community-link').onclick = function(e) {
    e.preventDefault();
    window.location.hash = '#create-community';
    showCreateCommunityForm();
};

function showProfile() {
	fetch('/api/profile', {
		headers: { Authorization: 'Bearer ' + token }
	})
		.then(res => res.json())
		.then(user => {
			let pfpImg = user.pfp ? `<img src='${user.pfp}' class='pfp' style='width:64px;height:64px;'>` : `<span class='pfp pfp-placeholder' style='width:64px;height:64px;font-size:2em;'>${user.username[0].toUpperCase()}</span>`;
      let badges = getUserBadges(user).map(b => `<span class='badge' title='${b.description}'><img src='${b.image}' style='width:24px;height:24px;border-radius:50%;vertical-align:middle;margin-right:0.3em;'>${b.name}</span>`).join(' ');
			show(`
				<h2>Profile</h2>
				<div style='margin-bottom:1em;'>${pfpImg}</div>
				<form id='pfpForm' enctype='multipart/form-data'>
					<input type='file' name='pfp' accept='image/*'>
					<button type='submit'>Change Profile Picture</button>
				</form>
				<p>Username: ${user.username}</p>
				<p>Email: ${user.email}</p>
				<p>Role: ${user.role}</p>
				<p>Posts: ${user.post_count || 0}</p>
        <div style='margin:1em 0;'>${badges}</div>
			`);
			document.getElementById('pfpForm').onsubmit = function(e) {
				e.preventDefault();
				let form = e.target;
				let data = new FormData(form);
				fetch('/api/profile/pfp', {
					method: 'POST',
					headers: { Authorization: 'Bearer ' + token },
					body: data
				})
					.then(res => res.json())
					.then(res => {
						if (res.success) {
							showAlert('Profile picture updated!', 'success');
							showProfile();
						} else {
							showAlert('Failed to update profile picture', 'error');
						}
					})
					.catch(() => showAlert('Failed to update profile picture', 'error'));
			};
		});
}

function showAdminPanel() {
	fetchThreads(); // For simplicity, admin actions can be added to thread/reply display
}

function showDeleteThreadConfirm(id) {
    show(`
        <div class="confirm-dialog">
            <h3>Delete Thread?</h3>
            <p>This action cannot be undone.</p>
            <button onclick="confirmDeleteThread(${id})">Delete</button>
            <button onclick="fetchThreads()">Cancel</button>
        </div>
    `);
}

function confirmDeleteThread(id) {
    fetch('/api/admin/thread/' + id, {
        method: 'DELETE',
        headers: {
            Authorization: 'Bearer ' + token
        }
    })
    .then(res => res.json())
    .then(res => {
        if (res.success) {
            fetchThreads();
            showAlert('Thread deleted!', 'success');
        } else {
            showAlert('Failed to delete thread', 'error');
        }
    })
    .catch(() => showAlert('Failed to delete thread', 'error'));
}

function showDeleteReplyConfirm(id) {
    show(`
        <div class="confirm-dialog">
            <h3>Delete Reply?</h3>
            <p>This action cannot be undone.</p>
            <button onclick="confirmDeleteReply(${id})">Delete</button>
            <button onclick="fetchThreads()">Cancel</button>
        </div>
    `);
}

function confirmDeleteReply(id) {
    fetch('/api/admin/reply/' + id, {
        method: 'DELETE',
        headers: {
            Authorization: 'Bearer ' + token
        }
    })
    .then(res => res.json())
    .then(res => {
        if (res.success) {
            fetchThreads();
            showAlert('Reply deleted!', 'success');
        } else {
            showAlert('Failed to delete reply', 'error');
        }
    })
    .catch(() => showAlert('Failed to delete reply', 'error'));
}

function showThreadForm() {
    if (!token) {
        showAlert('Please log in to create threads', 'error');
        showLoginForm();
        return;
    }

    show(`
        <form id="threadForm">
            <input type="text" name="title" placeholder="Thread Title" required><br>
            <textarea name="content" placeholder="Thread Content" required></textarea><br>
            <input type="text" name="tags" placeholder="Tags (comma separated)"><br>
            <input type="file" name="image" accept="image/*"><br>
            <button type="submit">Create Thread</button>
            <button type="button" onclick="fetchThreads()">Cancel</button>
        </form>
    `);
    
    document.getElementById('threadForm').onsubmit = async function(e) {
        e.preventDefault();
        const form = e.target;
        
        // Disable form while submitting
        const submitBtn = form.querySelector('button[type="submit"]');
        const originalBtnText = submitBtn.textContent;
        submitBtn.disabled = true;
        submitBtn.textContent = 'Creating...';
        
        try {
            // Validate input
            if (!form.title.value.trim()) throw new Error('Title is required');
            if (!form.content.value.trim()) throw new Error('Content is required');
            
            let res;
            if (form.image.files.length > 0) {
                // If file is uploaded, use FormData
                const formData = new FormData(form);
                res = await fetch('/api/threads', {
                    method: 'POST',
                    headers: {
                        Authorization: 'Bearer ' + token
                    },
                    body: formData
                });
            } else {
                // No file, use JSON
                const data = {
                    title: form.title.value.trim(),
                    content: form.content.value.trim(),
                    tags: form.tags.value.trim()
                };
                res = await fetch('/api/threads', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: 'Bearer ' + token
                    },
                    body: JSON.stringify(data)
                });
            }

            if (!res.ok) {
                const errorText = await res.text();
                throw new Error(errorText || `Server returned ${res.status}`);
            }

            const data = await res.json();
            if (!data || !data.id) {
                throw new Error('Invalid server response');
            }

            fetchThreads();
            showAlert('Thread created successfully!', 'success');
            
        } catch (err) {
            console.error('Error creating thread:', err);
            showAlert(err.message || 'Failed to create thread', 'error');
            // Re-enable form
            submitBtn.disabled = false;
            submitBtn.textContent = originalBtnText;
            return;
        }
        
        // Reset and re-enable form on success
        submitBtn.disabled = false;
        submitBtn.textContent = originalBtnText;
        form.reset();
    };
}

// Communities functionality
function showCreateCommunityForm() {
    if (!token) {
        showAlert('Please log in to create a community', 'error');
        showLoginForm();
        return;
    }

    show(`
        <div class="create-community-form">
            <h2>Create a New Community</h2>
            <form id="createCommunityForm">
                <div class="form-row">
                    <label for="name">Community Name</label>
                    <input type="text" id="name" name="name" required>
                </div>
                <div class="form-row">
                    <label for="description">Description</label>
                    <textarea id="description" name="description" required></textarea>
                </div>
                <div class="form-row">
                    <label for="rules">Community Rules</label>
                    <textarea id="rules" name="rules"></textarea>
                </div>
                <div class="form-row">
                    <label>
                        <input type="checkbox" name="is_private">
                        Private Community
                    </label>
                </div>
                <div class="button-group">
                    <button type="submit">Create Community</button>
                    <button type="button" onclick="showCommunities()" class="secondary">Cancel</button>
                </div>
            </form>
        </div>
    `);

    document.getElementById('createCommunityForm').onsubmit = async function(e) {
        e.preventDefault();
        const form = e.target;
        const data = {
            name: form.name.value,
            description: form.description.value,
            rules: form.rules.value,
            is_private: form.is_private.checked
        };

        try {
            const res = await fetch('/api/communities', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + token
                },
                body: JSON.stringify(data)
            });

            if (!res.ok) {
                const error = await res.json();
                throw new Error(error.error || 'Failed to create community');
            }

            const result = await res.json();
            showAlert('Community created successfully!', 'success');
            showCommunity(result.id);
        } catch (err) {
            showAlert(err.message, 'error');
        }
    };
}

function showCommunities() {
    show('<div class="loading">Loading communities...</div>');
    
    fetch('/api/communities')
        .then(res => {
            if (!res.ok) {
                throw new Error('Server returned ' + res.status);
            }
            return res.json();
        })
        .then(data => {
            // Ensure data is always an array
            const communities = Array.isArray(data) ? data : [];
            
            let html = `
                <div class="communities-header">
                    <h1>Communities</h1>
                    <div class="button-group">
                        ${token ? '<button onclick="showCreateCommunityForm()">Create Community</button>' : ''}
                    </div>
                </div>
            `;
            
            if (communities.length === 0) {
                html += `
                    <div class="empty-state">
                        <p>No communities found.</p>
                        ${token ? '<p>Create the first community!</p>' : '<p>Log in to create the first community!</p>'}
                    </div>
                `;
            } else {
                html += '<div class="communities-grid">';
                communities.forEach(community => {
                    html += `
                        <div class="community-card" onclick="showCommunity(${community.id})">
                            <div class="community-banner">
                                ${community.banner_image ? 
                                  `<img src="${community.banner_image}" alt="${community.name}">` : ''}
                            </div>
                            <div class="community-content">
                                <h3 class="community-name">${community.name}</h3>
                                <p class="community-description">${community.description}</p>
                                <div class="community-stats">
                                    <span>${community.member_count || 0} members</span>
                                    <span>${community.thread_count || 0} threads</span>
                                </div>
                            </div>
                        </div>
                    `;
                });
                html += '</div>';
            }
            
            show(html);
        })
        .catch(err => {
            console.error('Error loading communities:', err);
            show(`
                <div class="error-state">
                    <h2>Error Loading Communities</h2>
                    <p>There was a problem loading the communities. Please try again.</p>
                    <p class="error-details">${err.message}</p>
                    <button onclick="showCommunities()">Retry</button>
                </div>
            `);
        });
}

function showCommunity(id) {
    show('<div class="loading">Loading community...</div>');
    
    Promise.all([
        fetch('/api/communities/' + id).then(res => res.json()),
        fetch('/api/communities/' + id + '/threads').then(res => res.json())
    ]).then(([community, threads]) => {
        let html = `
            <div class="community-header">
                <h1>${community.name}</h1>
                <p>${community.description}</p>
                <div class="community-stats">
                    <span>${community.member_count} members</span>
                    <span>${community.thread_count} threads</span>
                </div>
                ${community.rules ? `
                    <div class="community-rules">
                        <h3>Community Rules</h3>
                        <p>${community.rules}</p>
                    </div>
                ` : ''}
            </div>

            <div class="button-group">
                <button onclick="showThreadForm(${id})">New Thread</button>
                <button onclick="showCommunities()" class="secondary">Back to Communities</button>
            </div>
        `;

        if (threads.length === 0) {
            html += '<p>No threads yet. Be the first to post!</p>';
        } else {
            threads.forEach(thread => {
                html += renderThread(thread);
            });
        }

        show(html);
    })
    .catch(err => {
        show('<p>Error loading community. Please try again.</p>');
    });
}

function showDeleteThreadConfirm(id) {
    if (!currentUser || currentUser.role !== 'admin') {
        showAlert('Only admins can delete threads', 'error');
        return;
    }
    show(`
        <div class="confirm-dialog">
            <h3>Delete Thread?</h3>
            <p>This action cannot be undone.</p>
            <div class="button-group">
                <button class="danger-btn" onclick="confirmDeleteThread(${id})">Delete</button>
                <button onclick="fetchThreads()">Cancel</button>
            </div>
        </div>
    `);
}

function showEditThreadForm(id, title, content) {
    if (!currentUser || currentUser.role !== 'admin') {
        showAlert('Only admins can edit threads', 'error');
        return;
    }
    show(`
        <form id='editThreadForm'>
            <h3>Edit Thread</h3>
            <div class="form-group">
                <label for="title">Title</label>
                <input name='title' value='${decodeURIComponent(title)}' required>
            </div>
            <div class="form-group">
                <label for="content">Content</label>
                <textarea name='content' required>${decodeURIComponent(content)}</textarea>
            </div>
            <div class="button-group">
                <button type='submit'>Save Changes</button>
                <button type='button' onclick='fetchThreads()'>Cancel</button>
            </div>
        </form>
    `);
    
    document.getElementById('editThreadForm').onsubmit = function(e) {
        e.preventDefault();
        const submitBtn = e.target.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Saving...';
        
        fetch('/api/admin/thread/' + id, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                Authorization: 'Bearer ' + token
            },
            body: JSON.stringify({
                title: e.target.title.value.trim(),
                content: e.target.content.value.trim()
            })
        })
        .then(res => {
            if (!res.ok) throw new Error('Server returned ' + res.status);
            return res.json();
        })
        .then(res => {
            if (res.success) {
                fetchThreads();
                showAlert('Thread updated!', 'success');
            } else {
                throw new Error(res.error || 'Failed to update thread');
            }
        })
        .catch(err => {
            showAlert(err.message, 'error');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Save Changes';
        });
    };
}

function showThreadForm(communityId) {
    if (!token) {
        showAlert('Please log in to create threads', 'error');
        showLoginForm();
        return;
    }

    // First fetch communities for the dropdown if no communityId provided
    const showForm = (communities) => {
        show(`
            <form id="threadForm" class="create-thread-form">
                <div class="form-row">
                    <label for="title">Title</label>
                    <input type="text" id="title" name="title" required>
                </div>
                <div class="form-row">
                    <label for="content">Content</label>
                    <textarea id="content" name="content" required></textarea>
                </div>
                <div class="form-row">
                    <label for="tags">Tags (comma separated)</label>
                    <input type="text" id="tags" name="tags">
                </div>
                <div class="form-row">
                    <label for="image">Image (optional)</label>
                    <input type="file" id="image" name="image" accept="image/*">
                </div>
                ${!communityId ? `
                    <div class="form-row">
                        <label for="community">Community</label>
                        <select id="community" name="community_id" required>
                            ${communities.map(c => 
                                `<option value="${c.id}" ${c.name === 'General Discussion' ? 'selected' : ''}>${c.name}</option>`
                            ).join('')}
                        </select>
                    </div>
                ` : `<input type="hidden" name="community_id" value="${communityId}">`}
                <div class="button-group">
                    <button type="submit">Create Thread</button>
                    <button type="button" onclick="${communityId ? `showCommunity(${communityId})` : 'showHomePage()'}" class="secondary">Cancel</button>
                </div>
            </form>
        `);
    };

    if (!communityId) {
        fetch('/api/communities')
            .then(res => res.json())
            .then(communities => showForm(communities))
            .catch(err => {
                console.error('Error fetching communities:', err);
                showAlert('Error loading communities', 'error');
            });
    } else {
        showForm([]);
    }
    
    document.getElementById('threadForm').onsubmit = function(e) {
        e.preventDefault();
        const form = e.target;
        const submitBtn = form.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Creating...';
        
        let formData;
        if (form.image.files.length > 0) {
            formData = new FormData(form);
        } else {
            formData = new FormData();
            formData.append('title', form.title.value.trim());
            formData.append('content', form.content.value.trim());
            formData.append('tags', form.tags.value.trim());
            formData.append('community_id', form.community_id.value);
        }
        
        fetch('/api/threads', {
            method: 'POST',
            headers: { 
                Authorization: 'Bearer ' + token
            },
            body: formData
        })
        .then(res => {
            if (!res.ok) throw new Error('Server returned ' + res.status);
            return res.json();
        })
        .then(res => {
            if (res.id) {
                showAlert('Thread created!', 'success');
                showCommunity(communityId);
            } else {
                throw new Error('Invalid server response');
            }
        })
        .catch(err => {
            showAlert(err.message || 'Failed to create thread', 'error');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Create Thread';
        });
    };
}

// Update navigation function
function updateNav() {
    document.getElementById('login-link').style.display = token ? 'none' : '';
    document.getElementById('signup-link').style.display = token ? 'none' : '';
    document.getElementById('profile-link').style.display = token ? '' : 'none';
    document.getElementById('logout-link').style.display = token ? '' : 'none';
    document.getElementById('admin-link').style.display = currentUser && currentUser.role === 'admin' ? '' : 'none';
    document.getElementById('create-community-link').style.display = token ? '' : 'none';
}

// Show homepage with recent threads
function showHomePage() {
    show('<div class="loading">Loading recent threads...</div>');
    
    fetch('/api/threads')
        .then(res => {
            if (!res.ok) {
                throw new Error('Server returned ' + res.status);
            }
            return res.json();
        })
        .then(data => {
            // Ensure data is always an array
            const threads = Array.isArray(data) ? data : [];
            
            let html = `
                <div class="home-header">
                    <h1>Recent Discussions</h1>
                    <div class="button-group">
                        <button onclick="showCommunities()">Browse Communities</button>
                        ${token ? '<button onclick="showCreateCommunityForm()">Create Community</button>' : ''}
                    </div>
                </div>
            `;

            if (threads.length === 0) {
                html += '<p>No threads yet. Join a community and start the discussion!</p>';
            } else {
                threads.forEach(thread => {
                    html += renderThread(thread);
                });
            }

            show(html);
        })
        .catch(err => {
            console.error('Error loading threads:', err);
            show(`
                <div class="error-state">
                    <h2>Error Loading Threads</h2>
                    <p>There was a problem loading the recent threads. Please try again.</p>
                    <p class="error-details">${err.message}</p>
                    <button onclick="showHomePage()">Retry</button>
                </div>
            `);
        });
}

// Initial load
updateNav();
window.addEventListener('DOMContentLoaded', function() {
    const hash = window.location.hash;
    if (hash.startsWith('#user-')) {
        const userId = hash.replace('#user-', '');
        showPublicProfilePage(userId);
    } else if (hash.startsWith('#community-')) {
        const communityId = hash.replace('#community-', '');
        showCommunity(communityId);
    } else if (hash === '#communities') {
        showCommunities();
    } else {
        showHomePage();
    }
});

function showPublicProfilePage(userId) {
  window.location.hash = 'user-' + userId;
  fetch('/api/user/' + userId)
    .then(res => res.json())
    .then(user => {
      let pfpImg = user.pfp ? `<img src='${user.pfp}' class='pfp' style='width:64px;height:64px;'>` : `<span class='pfp pfp-placeholder' style='width:64px;height:64px;font-size:2em;'>${user.username[0].toUpperCase()}</span>`;
      let badges = getUserBadges(user).map(b => `<span class='badge' title='${b.description}'><img src='${b.image}' style='width:24px;height:24px;border-radius:50%;vertical-align:middle;margin-right:0.3em;'>${b.name}</span>`).join(' ');
      show(`
        <h2>Public Profile</h2>
        <div style='margin-bottom:1em;'>${pfpImg}</div>
        <p>Username: ${user.username}</p>
        <p>Role: ${user.role}</p>
        <p>Posts: ${user.post_count || 0}</p>
        <div style='margin:1em 0;'>${badges}</div>
			`);
		});
}

window.addEventListener('hashchange', function() {
  const hash = window.location.hash;
  if (hash.startsWith('#user-')) {
    const userId = hash.replace('#user-', '');
    showPublicProfilePage(userId);
  }
});
