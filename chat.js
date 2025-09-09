const socket = new SockJS('/chat');
const stompClient = Stomp.over(socket);

stompClient.connect({}, function(frame) {
    stompClient.subscribe('/topic/messages', function(message) {
        const msg = JSON.parse(message.body).content;
        displayMessage(msg, 'received');
    });
});

const messageInput = document.getElementById('messageInput');
const chatMessages = document.getElementById('chatMessages');

function sendMessage() {
    const message = messageInput.value.trim();
    if (message) {
        stompClient.send('/app/chat', {}, JSON.stringify({ content: message }));
        messageInput.value = '';
        displayMessage(message, 'sent');
    }
}

function displayMessage(message, type) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message', type);
    messageElement.textContent = message;
    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendMessage();
    }
});