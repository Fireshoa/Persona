import { Groq } from "https://esm.sh/groq-sdk";

const chatWindow = document.getElementById('chat-window');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const systemInput = document.getElementById('prompt');
const memoryInput = document.getElementById('memory-depth');
const modelSelect = document.getElementById('model-select');
const genderDropdown = document.getElementById('gender-dropdown');
const nameInput = document.getElementById('name-input');
const statsDisplay = document.getElementById('model-stats');

let sPrompt = ""; // Global variable to hold the fetched text
let selectedGender = localStorage.getItem("gender") || "Female";
let selectedName = localStorage.getItem("name") || "Cipher";
genderDropdown.value = selectedGender;
nameInput.value = selectedName;

// 1. Function to fetch the external prompt file
async function loadExternalPrompt() {
    try {
        const response = await fetch('prompt.txt');
        if (!response.ok) throw new Error("Could not find prompt.txt");
        sPrompt = await response.text();
        console.log("External prompt loaded.");

        // Update the initial message once the file is ready
        messages[0].content = generateSysPrompt(systemInput.value);
    } catch (err) {
        console.error("Error loading prompt.txt:", err);
        sPrompt = "";
    }
}

// 2. Updated function to use the fetched string
function generateSysPrompt(promptText) {
    const genderText = selectedGender !== "Not Specified" ? `Your gender is ${selectedGender.toLowerCase()},` : "";
    const nameText = selectedName ? ` and your name is ${selectedName}.` : "";
    const baseText = "You are a roleplay bot.";
    return `${genderText} ${nameText} ${baseText} This is your prompt: '${promptText}', ${sPrompt}`;
}

function stripThinkTags(text) {
    return text.replace(/<think>[\s\S]*?<\/think>/gi, '');
}

// Call the loader at the end of your script (or during init)
loadExternalPrompt();

const savedPrompt = localStorage.getItem("prompt") || "";
systemInput.value = savedPrompt;
let messages = [{ "role": "system", "content": generateSysPrompt(savedPrompt) }];

// Display Stats for the selected model
modelSelect.selectedIndex = localStorage.getItem("selectedModel")
if (!modelSelect.selectedIndex) {
    modelSelect.selectedIndex = 0
}
window.updateModelStats = () => {
    const selected = modelSelect.options[modelSelect.selectedIndex];
    statsDisplay.innerText = `MODEL: ${selected.value} | LIMITS: ${selected.dataset.tpm} TPM, ${selected.dataset.rpm} RPM`;
    localStorage.setItem("selectedModel", modelSelect.selectedIndex)
    if (selected.getAttribute("warn")) {
        alert(selected.getAttribute("warn"))
    }
};
updateModelStats();

genderDropdown.addEventListener('change', () => {
    selectedGender = genderDropdown.value;
    localStorage.setItem("gender", selectedGender);
    messages[0].content = generateSysPrompt(systemInput.value);
});

nameInput.addEventListener('input', () => {
    selectedName = nameInput.value.trim();
    localStorage.setItem("name", selectedName);
    messages[0].content = generateSysPrompt(systemInput.value);
});

window.updateSystem = () => {
    const newPrompt = systemInput.value.trim();

    // Update the system prompt (always index 0)
    messages[0].content = generateSysPrompt(newPrompt);

    // Ask if they want to KEEEP the history
    const keepHistory = confirm("Keep history? (Cancel to wipe everything)");

    if (!keepHistory) {
        // WIPE: Reset messages array to ONLY the system prompt
        messages = [messages[0]];

        // WIPE: Clear the UI and show the status message
        chatWindow.innerHTML = '<div class="text-yellow-500 text-xs italic text-center py-2">Cipher Bot Updated. History Wiped.</div>';
    } else {
        // KEEP: Don't touch the messages array, just show a small update notification
        const notification = document.createElement('div');
        notification.className = 'text-blue-400 text-xs italic text-center py-2';
        notification.innerText = 'Cipher Bot Updated. History Preserved.';
        chatWindow.appendChild(notification);
    }

    // Save to local storage
    localStorage.setItem("prompt", newPrompt);
    chatWindow.scrollTop = chatWindow.scrollHeight;
};

window.exportChat = () => {
    const blob = new Blob([JSON.stringify(messages, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `Cipher-roleplay-${Date.now()}.json`;
    a.click();
};

window.importChat = (event) => {
    const file = event.target.files[0];
    const reader = new FileReader();
    reader.onload = (e) => {
        messages = JSON.parse(e.target.result);
        renderAllMessages();
    };
    reader.readAsText(file);
};

function renderAllMessages() {
    chatWindow.innerHTML = '';
    messages.forEach((msg, actualIndex) => {
        if (msg.role !== 'system') appendMessage(msg.role, msg.content, actualIndex);
    });
}

window.clearChat = () => {
    messages = [messages[0]];
    chatWindow.innerHTML = '<div class="text-gray-400 italic text-center">History cleared.</div>';
};

window.manageKey = () => {
    const key = prompt("Enter Groq API Key:");
    if (key) { localStorage.setItem('groq_api_key', key); location.reload(); }
};

const apiKey = localStorage.getItem('groq_api_key');
if (!apiKey) { alert("API key required."); manageKey(); }
const groq = new Groq({ apiKey, dangerouslyAllowBrowser: true });

async function sendMessage() {
    const text = userInput.value.trim();
    if (!text || !apiKey) return;

    messages.push({ role: "user", content: text });
    appendMessage('user', text, messages.length - 1);
    userInput.value = '';
    const responseDiv = appendMessage('assistant', '...', messages.length);
    let fullAIResponse = "";

    try {
        const depth = parseInt(memoryInput.value) || 10;
        const contextToSend = [messages[0], ...messages.slice(-depth)];

        const tempSlider = document.getElementById('temp-slider');
        const temperature = parseFloat(tempSlider.value);

        const stream = await groq.chat.completions.create({
            messages: contextToSend,
            model: modelSelect.value,
            temperature: temperature,
            stream: true,
        });

        responseDiv.innerText = "";
        for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || "";
            fullAIResponse += content;

            // UPDATE THIS LINE: Use innerHTML and formatRPText here too
            let displayContent = stripThinkTags(fullAIResponse).replace(/[\u4e00-\u9fa5]/g, '');
            responseDiv.innerHTML = formatRPText(displayContent);

            chatWindow.scrollTop = chatWindow.scrollHeight;
        }
        messages.push({ role: "assistant", content: fullAIResponse });

    } catch (err) {
        responseDiv.innerText = "Error: " + err.message;
    }
}

function formatRPText(text) {
    if (!text) return "";

    // 1. Remove think tags entirely first
    let formatted = text.replace(/<think>[\s\S]*?<\/think>/gi, '');

    // 2. Convert Exclamation Marks to Bold Red
    formatted = formatted.replace(/\{(.*?)\}/g, '<strong class="bold text-red-300 opacity-90">$1</strong>');

    // 3. Convert Single Asterisks to Italics
    formatted = formatted.replace(/\*(.*?)\*/g, '<i class="italic text-gray-300 opacity-90">$1</i>');

    // 4. Convert Newlines to <br>
    formatted = formatted.replace(/\n/g, '<br>');

    // 5. TRIM LOGIC: Remove <br> and whitespace from the start and end
    // This regex looks for any combination of <br>, <br/>, or whitespace at the edges
    formatted = formatted.replace(/^(?:<br\s*\/?>|\s)+|(?:<br\s*\/?>|\s)+$/gi, '');

    return formatted;
}

function appendMessage(role, text, index) {
    const div = document.createElement('div');
    div.id = `msg-${index}`;
    div.className = role === 'user' ? "flex justify-end w-full" : "flex justify-start w-full";

    const span = document.createElement('span');
    span.className = `inline-block p-4 rounded-2xl max-w-[80%] ${role === 'user' ? "bg-blue-700 text-white rounded-tr-none shadow-lg" : "bg-gray-700 text-gray-100 rounded-tl-none shadow-md"}`;

    // Apply the formatting
    let cleanText = (role === 'assistant' ? stripThinkTags(text) : text).trim();
    span.innerHTML = formatRPText(cleanText);

    div.appendChild(span);

    // --- Keep your existing button logic below ---
    const buttonDiv = document.createElement('div');
    buttonDiv.className = 'flex gap-1 mt-1 justify-end items-top';

    if (role === 'assistant') {
        const editBtn = document.createElement('button');
        editBtn.innerText = '✏️';
        editBtn.className = 'w-7 h-7 flex items-center justify-center text-xs bg-gray-600 hover:bg-yellow-500 rounded opacity-50 hover:opacity-100 transition-opacity';
        editBtn.onclick = () => editMessage(index);
        buttonDiv.appendChild(editBtn);
    }

    const deleteBtn = document.createElement('button');
    deleteBtn.innerText = '🗑️';
    deleteBtn.className = 'w-7 h-7 flex items-center justify-center text-xs bg-gray-600 hover:bg-red-500 rounded opacity-50 hover:opacity-100 transition-opacity';
    deleteBtn.onclick = () => deleteMessage(index);
    buttonDiv.appendChild(deleteBtn);

    div.appendChild(buttonDiv);
    chatWindow.appendChild(div);
    chatWindow.scrollTop = chatWindow.scrollHeight;
    return span;
}

window.deleteMessage = (index) => {
    if (confirm('Are you sure you want to delete this message?')) {
        messages.splice(index, 1);
        renderAllMessages();
    }
};

window.editMessage = (index) => {
    const div = document.getElementById(`msg-${index}`);
    const span = div.querySelector('span');
    span.style.display = 'none';

    const textarea = document.createElement('textarea');
    textarea.value = stripThinkTags(messages[index].content).trim();
    textarea.className = 'w-full bg-gray-700 border border-gray-600 p-2 rounded text-white resize-none';
    textarea.rows = 4;

    const buttonDiv = document.createElement('div');
    buttonDiv.className = 'flex gap-2 mt-2 justify-end';

    const saveBtn = document.createElement('button');
    saveBtn.innerText = 'Save';
    saveBtn.className = 'text-xs bg-green-600 hover:bg-green-500 px-3 py-1 rounded';
    saveBtn.onclick = () => {
        messages[index].content = textarea.value.trim();
        renderAllMessages();
    };

    const cancelBtn = document.createElement('button');
    cancelBtn.innerText = 'Cancel';
    cancelBtn.className = 'text-xs bg-gray-600 hover:bg-gray-500 px-3 py-1 rounded';
    cancelBtn.onclick = () => renderAllMessages();

    buttonDiv.appendChild(saveBtn);
    buttonDiv.appendChild(cancelBtn);

    div.appendChild(textarea);
    div.appendChild(buttonDiv);
};

window.applyPreset = () => {
    const pdropdown = document.getElementById('preset-dropdown');
    const gdropdown = document.getElementById('gender-dropdown');
    const systemInput = document.getElementById('prompt');

    if (pdropdown.value) {
        // 1. Fill the text input with the option value
        systemInput.value = pdropdown.value;

        // 2. Set gender if selected
        if (gdropdown.value && gdropdown.value !== "Not Specified") {
            selectedGender = gdropdown.value;
            localStorage.setItem("gender", selectedGender);
            genderDropdown.value = selectedGender;
        }

        // 3. Trigger the existing updateSystem logic to lock it in
        window.updateSystem();

        console.log("Preset Applied:", pdropdown.options[pdropdown.selectedIndex].text);
    }
};

sendBtn.addEventListener('click', sendMessage);
// Function to auto-resize the textarea as you type
userInput.addEventListener('input', function () {
    this.style.height = 'auto';
    this.style.height = (this.scrollHeight) + 'px';
});

userInput.addEventListener('keypress', (e) => {
    // If Enter is pressed WITHOUT Shift, send the message
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault(); // Prevents a new line from being added
        sendMessage();
        // Reset height after sending
        userInput.style.height = 'auto';
    }
});
systemInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') window.updateSystem(); });