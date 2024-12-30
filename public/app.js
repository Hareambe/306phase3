import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.21.0/firebase-app.js';
import {
	getDatabase,
	ref,
	push,
	onValue,
	get,
} from 'https://www.gstatic.com/firebasejs/9.21.0/firebase-database.js';
import firebaseConfig from './firebaseConfig.js';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// DOM Elements
const loginView = document.getElementById('loginView');
const userView = document.getElementById('userView');
const adminView = document.getElementById('adminView');
const adminMessagingView = document.getElementById('adminMessagingView');
const loginForm = document.getElementById('loginForm');
const messageForm = document.getElementById('messageForm');
const messagesContainer = document.getElementById('messagesContainer');
const usersContainer = document.getElementById('usersContainer');
const adminMessagesContainer = document.getElementById(
	'adminMessagesContainer'
);
const adminMessageForm = document.getElementById('adminMessageForm');
const selectedUserDisplay = document.getElementById('selectedUser');
const guestLoginButton = document.getElementById('guestLoginButton');
const registerView = document.getElementById('registerView');
const registerForm = document.getElementById('registerForm');
// Store logged-in user information and selected user
let currentUser = null;
let selectedUser = null;

function switchView(view) {
	const views = {
		loginView,
		registerView,
		userView,
		adminView,
		adminMessagingView,
	};

	Object.values(views).forEach((v) => v.classList.add('hidden'));

	if (typeof view === 'string') {
		views[view].classList.remove('hidden');
	} else {
		view.classList.remove('hidden');
	}
}

// Attach switchView to the global window object
window.switchView = switchView;

// Login Logic
loginForm.addEventListener('submit', (e) => {
	e.preventDefault();
	const username = document.getElementById('username').value;
	const password = document.getElementById('password').value;

	get(ref(db, 'users')).then((snapshot) => {
		const users = snapshot.val();
		let validUser = null;

		for (const key in users) {
			if (
				users[key].username === username &&
				users[key].password === password
			) {
				validUser = users[key];
				break;
			}
		}

		if (validUser) {
			currentUser = validUser;
			alert('Login successful!');

			if (currentUser.admin) {
				switchView('adminView');
				populateUsersList();
			} else {
				switchView('userView');
				listenForMessages();
			}
		} else {
			alert('Invalid username or password.');
		}
	});
});

// Logout Logic
window.logout = function () {
	currentUser = null;
	alert('Logged out successfully.');
	switchView('loginView');
};
// Handle Registration
registerForm.addEventListener('submit', (e) => {
	e.preventDefault();

	const username = document.getElementById('registerUsername').value.trim();
	const password = document.getElementById('registerPassword').value.trim();

	// Check if the username already exists
	get(ref(db, 'users')).then((snapshot) => {
		const users = snapshot.val();
		let usernameExists = false;

		// Iterate through users to check for duplicates
		for (const key in users) {
			if (users[key].username === username) {
				usernameExists = true;
				break;
			}
		}

		if (usernameExists) {
			alert(
				'Username already exists. Please choose a different username.'
			);
		} else {
			// Add user to the Firebase database
			push(ref(db, 'users'), {
				username: username,
				password: password,
				admin: false, // Default: not an admin
			});

			alert('Registration successful! Please log in.');
			switchView('loginView');
		}
	});
});

// User Messaging Logic
if (messageForm) {
	messageForm.addEventListener('submit', (e) => {
		e.preventDefault();
		const message = document.getElementById('message').value;

		if (!currentUser) {
			alert('You must be logged in to send messages.');
			return;
		}

		push(ref(db, 'messages'), {
			username: currentUser.username,
			message: message,
			received: false,
		});

		messageForm.reset();
	});
}

// Real-Time Message Listener
function listenForMessages() {
	if (!currentUser) {
		console.error('User is not logged in.');
		return;
	}

	onValue(ref(db, 'messages'), (snapshot) => {
		messagesContainer.innerHTML = ''; // Clear previous messages

		let hasMessages = false;

		snapshot.forEach((childSnapshot) => {
			const msg = childSnapshot.val();

			// Show all messages for the logged-in user
			if (msg.username === currentUser.username || currentUser.admin) {
				hasMessages = true;
				const div = document.createElement('div');
				div.classList.add(
					msg.received ? 'admin-message' : 'user-message'
				);

				// Display "Admin" as the username for received messages in the admin view
				const displayUsername = msg.received ? 'Admin' : msg.username;
				div.textContent = `${displayUsername}: ${msg.message}`;
				messagesContainer.appendChild(div);
			}
		});

		// Show "No messages" if no matching messages are found
		if (!hasMessages) {
			messagesContainer.innerHTML = '<p>No messages to display.</p>';
		}
	});
}

// Admin: Populate Users and Messages
function populateUsersList() {
	onValue(ref(db, 'messages'), (snapshot) => {
		usersContainer.innerHTML = ''; // Clear previous data
		const messages = snapshot.val();
		const userMessages = {};

		// Group messages by username
		for (const key in messages) {
			const msg = messages[key];
			if (!userMessages[msg.username]) {
				userMessages[msg.username] = [];
			}
			userMessages[msg.username].push(msg.message);
		}

		// Display users and their messages
		for (const username in userMessages) {
			const userDiv = document.createElement('div');
			userDiv.classList.add('user-item');
			userDiv.innerHTML = `
				<h3>${username}</h3>
				<div>${userMessages[username].map((msg) => `<p>${msg}</p>`).join('')}</div>
				<button onclick="selectUser('${username}')">Message User</button>
			`;
			usersContainer.appendChild(userDiv);
		}
	});
}

window.selectUser = function (username) {
	selectedUser = username;
	selectedUserDisplay.textContent = username;
	switchView('adminMessagingView');

	// Real-time listener for messages with the selected user
	onValue(ref(db, 'messages'), (snapshot) => {
		adminMessagesContainer.innerHTML = ''; // Clear previous messages

		let hasMessages = false;

		snapshot.forEach((childSnapshot) => {
			const msg = childSnapshot.val();

			// Show all messages for the selected user and admin
			if (msg.username === selectedUser) {
				hasMessages = true;
				const div = document.createElement('div');
				div.classList.add(
					msg.received ? 'admin-message' : 'user-message'
				);

				// Display "Admin" for messages sent by the admin
				const displayUsername = msg.received ? 'Admin' : msg.username;
				div.textContent = `${displayUsername}: ${msg.message}`;
				adminMessagesContainer.appendChild(div);
			}
		});

		// Show "No messages" if no matching messages are found
		if (!hasMessages) {
			adminMessagesContainer.innerHTML = '<p>No messages to display.</p>';
		}
	});
};

// Admin: Send Message to Selected User
adminMessageForm.addEventListener('submit', (e) => {
	e.preventDefault();
	const message = document.getElementById('adminMessage').value;

	if (!selectedUser) {
		alert('No user selected.');
		return;
	}

	push(ref(db, 'messages'), {
		username: selectedUser,
		message: message,
		received: true,
	});

	adminMessageForm.reset();
});

// Guest Login Logic
if (guestLoginButton) {
	guestLoginButton.addEventListener('click', () => {
		// Generate a unique guest username
		const uniqueId = `Guest_${Date.now()}_${Math.floor(
			Math.random() * 10000
		)}`;
		currentUser = {
			username: uniqueId,
			guest: true,
		};

		alert(`Logged in as ${currentUser.username}`);
		switchView('userView');
		listenForMessages();
	});
}
