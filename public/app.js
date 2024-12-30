import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.21.0/firebase-app.js';
import {
	getDatabase,
	ref,
	push,
	onValue,
	get,
	update,
} from 'https://www.gstatic.com/firebasejs/9.21.0/firebase-database.js';
import firebaseConfig from './firebaseConfig.js';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// DOM Elements
const loginView = document.getElementById('loginView');
const registerView = document.getElementById('registerView');
const userView = document.getElementById('userView');
const adminView = document.getElementById('adminView');

const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const guestLoginButton = document.getElementById('guestLoginButton');

const createTicketButton = document.getElementById('createTicketButton');
const ticketSubjectDropdown = document.getElementById('ticketSubject');
const ticketTopicInput = document.getElementById('ticketTopic');

const userTicketsContainer = document.getElementById('userTicketsContainer');
const adminTicketsContainer = document.getElementById('adminTicketsContainer');

const ticketDetailView = document.getElementById('ticketDetailView');
const ticketIdDisplay = document.getElementById('ticketIdDisplay');
const ticketSubjectDisplay = document.getElementById('ticketSubjectDisplay');
const ticketTopicDisplay = document.getElementById('ticketTopicDisplay');
const ticketMessagesContainer = document.getElementById(
	'ticketMessagesContainer'
);
const ticketMessageForm = document.getElementById('ticketMessageForm');
const ticketMessageInput = document.getElementById('ticketMessageInput');
const backToTicketsButton = document.getElementById('backToTicketsButton');
const resolveTicketButton = document.getElementById('resolveTicketButton');

// (NEW) Filter Buttons for Admin
document.getElementById('filterAllBtn').addEventListener('click', () => {
	adminFilter = 'all';
	loadAllTicketsForAdmin();
});
document.getElementById('filterResolvedBtn').addEventListener('click', () => {
	adminFilter = 'resolved';
	loadAllTicketsForAdmin();
});
document.getElementById('filterUnresolvedBtn').addEventListener('click', () => {
	adminFilter = 'unresolved';
	loadAllTicketsForAdmin();
});

// (NEW) Filter Buttons for User
const userFilterAllBtn = document.getElementById('userFilterAllBtn');
const userFilterResolvedBtn = document.getElementById('userFilterResolvedBtn');
const userFilterUnresolvedBtn = document.getElementById(
	'userFilterUnresolvedBtn'
);

// (NEW) Add event listeners for user filter buttons
userFilterAllBtn.addEventListener('click', () => {
	userFilter = 'all';
	loadUserTickets();
});
userFilterResolvedBtn.addEventListener('click', () => {
	userFilter = 'resolved';
	loadUserTickets();
});
userFilterUnresolvedBtn.addEventListener('click', () => {
	userFilter = 'unresolved';
	loadUserTickets();
});

// Store logged-in user info
let currentUser = null;
let currentTicketKey = null; // Global var storing the DB key for the currently viewed ticket
let adminFilter = 'all'; // default for admin
let userFilter = 'all'; // (NEW) default for user

// Helper: Switch Views
function switchView(view) {
	const views = {
		loginView,
		registerView,
		userView,
		adminView,
		ticketDetailView,
	};

	// Hide all views
	Object.values(views).forEach((v) => v.classList.add('hidden'));
	// Show the chosen view
	views[view]?.classList.remove('hidden');
}
window.switchView = switchView;

/* -------------------
   LOGIN LOGIC
---------------------*/
loginForm.addEventListener('submit', (e) => {
	e.preventDefault();
	const username = document.getElementById('username').value.trim();
	const password = document.getElementById('password').value.trim();

	get(ref(db, 'users')).then((snapshot) => {
		const users = snapshot.val() || {};

		// Find a user with matching credentials
		const validUserKey = Object.keys(users).find((key) => {
			return (
				users[key].username === username &&
				users[key].password === password
			);
		});

		if (validUserKey) {
			currentUser = users[validUserKey];
			alert('Login successful!');

			if (currentUser.admin) {
				switchView('adminView');
				loadAllTicketsForAdmin(); // Admin sees all tickets
			} else {
				switchView('userView');
				loadUserTickets(); // Normal user sees their own tickets
			}
		} else {
			alert('Invalid username or password.');
		}
	});
});

/* -------------------
   LOGOUT LOGIC
---------------------*/
window.logout = function () {
	currentUser = null;
	alert('Logged out successfully.');
	switchView('loginView');
};

/* -------------------
   REGISTRATION LOGIC
---------------------*/
registerForm.addEventListener('submit', (e) => {
	e.preventDefault();

	const username = document.getElementById('registerUsername').value.trim();
	const password = document.getElementById('registerPassword').value.trim();

	get(ref(db, 'users')).then((snapshot) => {
		const users = snapshot.val() || {};

		// Check if username already exists
		const usernameExists = Object.values(users).some(
			(user) => user.username === username
		);

		if (usernameExists) {
			alert('Username already exists.');
		} else {
			// By default, new users are not admin
			push(ref(db, 'users'), { username, password, admin: false });
			alert('Registration successful! Please log in.');
			switchView('loginView');
		}
	});
});

/* -------------------
   RESOLVE BUTTON
---------------------*/
resolveTicketButton.addEventListener('click', () => {
	if (!currentTicketKey) return;
	markTicketResolved(currentTicketKey);
});

/* -------------------
   GUEST LOGIN LOGIC
---------------------*/
guestLoginButton.addEventListener('click', () => {
	const uniqueId = `Guest_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
	currentUser = { username: uniqueId, guest: true };

	alert(`Logged in as ${currentUser.username}`);
	switchView('userView');
	loadUserTickets();
});

/* -------------------
   USER TICKET CREATION
---------------------*/
createTicketButton.addEventListener('click', () => {
	// Ensure the user is logged in
	if (!currentUser) {
		alert('You must be logged in to create a ticket.');
		return;
	}

	const ticketSubject = ticketSubjectDropdown.value;
	const ticketTopic = ticketTopicInput.value.trim();

	// Check for empty fields
	if (!ticketSubject || !ticketTopic) {
		alert(
			'Please fill out both the subject and the topic before creating a ticket.'
		);
		return;
	}

	const ticketId = `Ticket_${Date.now()}_${Math.floor(
		Math.random() * 10000
	)}`;

	push(ref(db, 'tickets'), {
		ticketId,
		subject: ticketSubject,
		topic: ticketTopic,
		username: currentUser.username,
		resolved: false,
		timestamp: Date.now(),
	});

	alert('Ticket created successfully!');
	ticketTopicInput.value = '';
	loadUserTickets();
});

/* -------------------
   LOAD USER'S TICKETS
   (Now in Reverse + Filtering)
---------------------*/
function loadUserTickets() {
	if (!currentUser) return;

	onValue(ref(db, 'tickets'), (snapshot) => {
		userTicketsContainer.innerHTML = '';

		if (!snapshot.exists()) {
			userTicketsContainer.innerHTML = '<p>No tickets found.</p>';
			return;
		}

		const ticketsObj = snapshot.val();
		// Reverse the keys for newest first
		let ticketKeys = Object.keys(ticketsObj).reverse();

		// Convert each key to an object { dbKey, ...ticketData }
		let allTicketsArr = ticketKeys.map((key) => {
			return { dbKey: key, ...ticketsObj[key] };
		});

		// Filter for only the current user's tickets
		let userTicketsArr = allTicketsArr.filter(
			(ticket) => ticket.username === currentUser.username
		);

		// Now apply userFilter (all, resolved, unresolved)
		if (userFilter === 'resolved') {
			userTicketsArr = userTicketsArr.filter((t) => t.resolved === true);
		} else if (userFilter === 'unresolved') {
			userTicketsArr = userTicketsArr.filter((t) => t.resolved === false);
		}
		// if 'all', do nothing

		if (userTicketsArr.length === 0) {
			userTicketsContainer.innerHTML = `<p>No ${userFilter} tickets found.</p>`;
			return;
		}

		userTicketsArr.forEach((ticket) => {
			const ticketDiv = document.createElement('div');
			ticketDiv.classList.add('ticket-item');

			// Show if it's resolved or not
			const resolvedLabel = ticket.resolved
				? '<span style="color: green;">(Resolved)</span>'
				: '<span style="color: red;">(Unresolved)</span>';

			ticketDiv.innerHTML = `
        <p><strong>Subject:</strong> ${ticket.subject} ${resolvedLabel}</p>
        <p><strong>Topic:</strong> ${ticket.topic}</p>
      `;

			// "View Details" button
			const viewDetailsBtn = document.createElement('button');
			viewDetailsBtn.textContent = 'View Details';
			// Pass data attributes
			viewDetailsBtn.dataset.ticketId = ticket.ticketId;
			viewDetailsBtn.dataset.subject = ticket.subject;
			viewDetailsBtn.dataset.topic = ticket.topic;
			// We also need the ticketKey if we want to pass it
			viewDetailsBtn.dataset.ticketKey = ticket.dbKey;

			viewDetailsBtn.addEventListener('click', () => {
				viewTicketDetails(
					ticket.ticketId,
					ticket.subject,
					ticket.topic,
					ticket.dbKey
				);
			});
			ticketDiv.appendChild(viewDetailsBtn);

			userTicketsContainer.appendChild(ticketDiv);
		});
	});
}

/* -------------------
   CHECK IF TICKET IS RESOLVED
   (Show or Hide the "Resolve" button)
---------------------*/
function checkIfTicketResolved(ticketKey) {
	// If not admin, just hide the button
	const resolveBtn = document.getElementById('resolveTicketButton');
	if (!currentUser || !currentUser.admin) {
		resolveBtn.classList.add('hidden');
		return;
	}

	// Otherwise, get the ticket data
	get(ref(db, 'tickets/' + ticketKey)).then((snapshot) => {
		if (snapshot.exists()) {
			const ticket = snapshot.val();
			// If it's not resolved, show the button; otherwise, hide it
			if (!ticket.resolved) {
				resolveBtn.classList.remove('hidden');
			} else {
				resolveBtn.classList.add('hidden');
			}
		}
	});
}

/* -------------------
   ADMIN: LOAD ALL TICKETS
   (Reverse + Filter)
---------------------*/
function loadAllTicketsForAdmin() {
	onValue(ref(db, 'tickets'), (snapshot) => {
		adminTicketsContainer.innerHTML = '';

		if (!snapshot.exists()) {
			adminTicketsContainer.innerHTML = '<p>No tickets found.</p>';
			return;
		}

		const ticketsObj = snapshot.val();

		// Get keys in reverse order (newest first)
		let ticketKeys = Object.keys(ticketsObj).reverse();

		// Convert each key to an object { dbKey, ...ticketData }
		let ticketsArr = ticketKeys.map((key) => {
			return { dbKey: key, ...ticketsObj[key] };
		});

		// Filter based on adminFilter
		if (adminFilter === 'resolved') {
			ticketsArr = ticketsArr.filter((t) => t.resolved === true);
		} else if (adminFilter === 'unresolved') {
			ticketsArr = ticketsArr.filter((t) => t.resolved === false);
		}
		// if 'all', do nothing

		// If no tickets left after filtering
		if (ticketsArr.length === 0) {
			adminTicketsContainer.innerHTML = `<p>No ${adminFilter} tickets found.</p>`;
			return;
		}

		// Now display them
		ticketsArr.forEach((ticket) => {
			const ticketDiv = document.createElement('div');
			ticketDiv.classList.add('ticket-item');

			const resolvedLabel = ticket.resolved
				? '<span style="color: green;">(Resolved)</span>'
				: '<span style="color: red;">(Unresolved)</span>';

			ticketDiv.innerHTML = `
        <p><strong>Ticket ID:</strong> ${ticket.ticketId} ${resolvedLabel}</p>
        <p><strong>User:</strong> ${ticket.username}</p>
        <p><strong>Subject:</strong> ${ticket.subject}</p>
        <p><strong>Topic:</strong> ${ticket.topic}</p>
      `;

			// If unresolved, show "Mark as Resolved"
			if (!ticket.resolved) {
				const resolveBtn = document.createElement('button');
				resolveBtn.textContent = 'Mark as Resolved';
				resolveBtn.addEventListener('click', () => {
					markTicketResolved(ticket.dbKey, resolveBtn);
				});
				ticketDiv.appendChild(resolveBtn);
			}

			// View Details button
			const viewDetailsBtn = document.createElement('button');
			viewDetailsBtn.textContent = 'View Details';
			// Pass the dbKey as a data attribute
			viewDetailsBtn.setAttribute('data-ticket-key', ticket.dbKey);
			viewDetailsBtn.addEventListener('click', () => {
				viewTicketDetails(
					ticket.ticketId,
					ticket.subject,
					ticket.topic,
					ticket.dbKey
				);
			});
			ticketDiv.appendChild(viewDetailsBtn);

			adminTicketsContainer.appendChild(ticketDiv);
		});
	});
}

/* -------------------
   VIEW / LOAD TICKET DETAILS
---------------------*/
function viewTicketDetails(ticketId, subject, topic, ticketKey) {
	switchView('ticketDetailView');

	// Display info
	ticketIdDisplay.textContent = ticketId;
	ticketSubjectDisplay.textContent = subject;
	ticketTopicDisplay.textContent = topic;

	// Store the ticketKey in some global or DOM element for later use
	currentTicketKey = ticketKey;

	// Load messages
	loadTicketMessages(ticketId);

	// Also check if it's resolved or not to decide if we show "Mark as Resolved"
	checkIfTicketResolved(ticketKey);
}

/* -------------------
   LOAD TICKET MESSAGES
---------------------*/
function loadTicketMessages(ticketId) {
	onValue(ref(db, 'messages'), (snapshot) => {
		ticketMessagesContainer.innerHTML = '';
		const allMessages = snapshot.val() || {};

		// Filter only messages for this ticket
		const messages = Object.values(allMessages).filter(
			(msg) => msg.ticketId === ticketId
		);

		if (messages.length === 0) {
			ticketMessagesContainer.innerHTML = '<p>No messages yet.</p>';
		} else {
			messages.forEach((msg) => {
				// Determine if it was posted by the admin
				const isAdmin = msg.received === true;
				// If admin, display original username + "(Admin)"
				const displayName = isAdmin
					? `${msg.username} (Admin)`
					: msg.username;

				// Create a div for the message
				const msgDiv = document.createElement('div');
				msgDiv.classList.add('message-item');

				// If the message is NOT from the admin, color it green
				if (!isAdmin) {
					msgDiv.classList.add('user-message-green');
				}

				// Build the text
				msgDiv.textContent = `${displayName}: ${msg.message}`;
				ticketMessagesContainer.appendChild(msgDiv);
			});
		}
	});
}

/* -------------------
   MARK TICKET RESOLVED
---------------------*/
function markTicketResolved(ticketKey, resolveBtn) {
	update(ref(db, 'tickets/' + ticketKey), {
		resolved: true,
	})
		.then(() => {
			alert('Ticket marked as resolved!');
			// (NEW) Immediately hide the button if passed in:
			if (resolveBtn) {
				resolveBtn.classList.add('hidden');
			}
			// Also hide the "Resolve" button if we're in the detail view
			const detailResolveBtn = document.getElementById(
				'resolveTicketButton'
			);
			if (detailResolveBtn) {
				detailResolveBtn.classList.add('hidden');
			}
		})
		.catch((error) => {
			console.error('Error marking ticket resolved:', error);
		});
}

/* -------------------
   SEND A MESSAGE ON A TICKET
---------------------*/
ticketMessageForm.addEventListener('submit', (e) => {
	e.preventDefault();
	const message = ticketMessageInput.value.trim();
	const ticketId = ticketIdDisplay.textContent;

	if (!currentUser) {
		alert('You must be logged in to send a message.');
		return;
	}

	// We'll store the real username in the DB
	// 'received' indicates if this message is from an admin
	push(ref(db, 'messages'), {
		ticketId,
		username: currentUser.username,
		message,
		received: currentUser.admin ? true : false,
	});

	ticketMessageInput.value = '';
});

/* -------------------
   BACK TO TICKETS
---------------------*/
backToTicketsButton.addEventListener('click', () => {
	if (currentUser && currentUser.admin) {
		switchView('adminView');
	} else {
		switchView('userView');
	}
});
