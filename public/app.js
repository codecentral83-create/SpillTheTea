const body = document.body;

/* ------------------------------ */
/* AUTH / API HELPERS */
/* ------------------------------ */
function applyTheme(theme) {
  body.classList.remove("theme-soft", "theme-lavender", "theme-peach");
  body.classList.add(`theme-${theme || "soft"}`);
}

function saveToken(token) {
  localStorage.setItem("authToken", token);
}

function getToken() {
  return localStorage.getItem("authToken");
}

function clearToken() {
  localStorage.removeItem("authToken");
}

function logoutUser() {
  clearToken();
  window.location.href = "home.html";
}

async function apiFetch(url, options = {}) {
  const token = getToken();

  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    ...options,
    headers
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Request failed.");
  }

  return data;
}

async function loadCurrentUser() {
  const data = await apiFetch("/api/me");
  return data.user;
}

/* ------------------------------ */
/* UI HELPERS */
/* ------------------------------ */
function setProfileUI(user) {
  if (!user) return;

  applyTheme(user.theme);

  const firstLetter = (user.displayName || "Y").charAt(0).toUpperCase();

  const profileAvatar = document.getElementById("profileAvatar");
  const profileName = document.getElementById("profileName");
  const profileStatus = document.getElementById("profileStatus");

  const profilePageAvatar = document.getElementById("profilePageAvatar");
  const profilePageName = document.getElementById("profilePageName");
  const profilePageStatus = document.getElementById("profilePageStatus");
  const profilePageTheme = document.getElementById("profilePageTheme");

  const settingsName = document.getElementById("settingsName");
  const settingsStatus = document.getElementById("settingsStatus");
  const settingsTheme = document.getElementById("settingsTheme");

  const settingsPreviewAvatar = document.getElementById("settingsPreviewAvatar");
  const settingsPreviewName = document.getElementById("settingsPreviewName");
  const settingsPreviewStatus = document.getElementById("settingsPreviewStatus");

  if (profileAvatar) profileAvatar.textContent = firstLetter;
  if (profileName) profileName.textContent = user.displayName;
  if (profileStatus) profileStatus.textContent = user.status;

  if (profilePageAvatar) profilePageAvatar.textContent = firstLetter;
  if (profilePageName) profilePageName.textContent = user.displayName;
  if (profilePageStatus) profilePageStatus.textContent = user.status;
  if (profilePageTheme) {
    profilePageTheme.textContent =
      user.theme === "lavender"
        ? "Lavender Dream"
        : user.theme === "peach"
        ? "Peach Glow"
        : "Soft Pink";
  }

  if (settingsName) settingsName.value = user.displayName;
  if (settingsStatus) settingsStatus.value = user.status;
  if (settingsTheme) settingsTheme.value = user.theme;

  if (settingsPreviewAvatar) settingsPreviewAvatar.textContent = firstLetter;
  if (settingsPreviewName) settingsPreviewName.textContent = user.displayName;
  if (settingsPreviewStatus) settingsPreviewStatus.textContent = user.status;
}

function addMessage(text, sender) {
  const chatBox = document.getElementById("chatBox");
  if (!chatBox) return;

  const row = document.createElement("div");
  row.classList.add("message-row", sender);

  const bubble = document.createElement("div");
  bubble.classList.add("message-bubble");
  bubble.textContent = text;

  row.appendChild(bubble);
  chatBox.appendChild(row);
  chatBox.scrollTop = chatBox.scrollHeight;
}

function clearMessagesUI() {
  const chatBox = document.getElementById("chatBox");
  if (chatBox) {
    chatBox.innerHTML = "";
  }
}

function showTyping(show) {
  const typingStatus = document.getElementById("typingStatus");
  if (!typingStatus) return;

  if (show) {
    typingStatus.classList.remove("hidden");
  } else {
    typingStatus.classList.add("hidden");
  }
}

async function loadMessages() {
  clearMessagesUI();

  const data = await apiFetch("/api/messages");
  const messages = data.messages || [];

  if (messages.length === 0) {
    addMessage("Heyy, I’m Mia. What’s up?", "bot");
    return;
  }

  messages.forEach((message) => {
    addMessage(message.text, message.sender);
  });
}

/* ------------------------------ */
/* CHAT */
/* ------------------------------ */
async function sendMessage() {
  const userInput = document.getElementById("userInput");
  if (!userInput) return;

  const message = userInput.value.trim();
  if (!message) return;

  addMessage(message, "user");
  userInput.value = "";
  showTyping(true);

  try {
    const toneSelect = document.getElementById("toneSelect");
    const tone = toneSelect ? toneSelect.value : "balanced";

    const data = await apiFetch("/api/chat", {
      method: "POST",
      body: JSON.stringify({ message, tone })
    });

    showTyping(false);
    addMessage(data.reply || "I didn't get a reply.", "bot");
  } catch (error) {
    console.error("Send message error:", error);
    showTyping(false);
    addMessage(error.message || "Something went wrong.", "bot");
  }
}

/* ------------------------------ */
/* LOGIN PAGE */
/* ------------------------------ */
const loginForm = document.getElementById("loginForm");

if (loginForm) {
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const displayName = document.getElementById("displayName")?.value.trim() || "You";
    const status = document.getElementById("statusText")?.value.trim() || "soft girl era";
    const theme = document.getElementById("chatTheme")?.value || "soft";
    const username = displayName.toLowerCase().replace(/\s+/g, "_");

    try {
      const data = await apiFetch("/api/login", {
        method: "POST",
        body: JSON.stringify({
          username,
          displayName,
          status,
          theme
        })
      });

      if (!data.token) {
        throw new Error("No login token was returned.");
      }

      saveToken(data.token);
      window.location.href = "chat.html";
    } catch (error) {
      console.error("Login error:", error);
      alert(error.message || "Login failed.");
    }
  });
}

/* ------------------------------ */
/* CHAT PAGE */
/* ------------------------------ */
const chatForm = document.getElementById("chatForm");

if (chatForm) {
  const token = getToken();

  if (!token) {
    window.location.href = "login.html";
  } else {
    loadCurrentUser()
      .then((user) => {
        setProfileUI(user);
        return loadMessages();
      })
      .catch((error) => {
        console.error("Chat page auth error:", error);
        clearToken();
        window.location.href = "login.html";
      });
  }

  chatForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await sendMessage();
  });

  const newChatBtn = document.getElementById("newChatBtn");
  if (newChatBtn) {
    newChatBtn.addEventListener("click", async () => {
      try {
        await apiFetch("/api/messages", { method: "DELETE" });
        await loadMessages();
      } catch (error) {
        console.error("Clear messages error:", error);
        alert(error.message || "Could not clear chat.");
      }
    });
  }

  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", logoutUser);
  }
}

/* ------------------------------ */
/* SETTINGS PAGE */
/* ------------------------------ */
const saveSettingsPageBtn = document.getElementById("saveSettingsPageBtn");

if (saveSettingsPageBtn) {
  const token = getToken();

  if (!token) {
    window.location.href = "login.html";
  } else {
    loadCurrentUser()
      .then((user) => {
        setProfileUI(user);

        const settingsName = document.getElementById("settingsName");
        const settingsStatus = document.getElementById("settingsStatus");
        const settingsTheme = document.getElementById("settingsTheme");

        const settingsPreviewAvatar = document.getElementById("settingsPreviewAvatar");
        const settingsPreviewName = document.getElementById("settingsPreviewName");
        const settingsPreviewStatus = document.getElementById("settingsPreviewStatus");

        const updatePreview = () => {
          const previewName = settingsName?.value.trim() || "You";
          const previewStatus = settingsStatus?.value.trim() || "soft girl era";
          const previewTheme = settingsTheme?.value || "soft";

          if (settingsPreviewAvatar) {
            settingsPreviewAvatar.textContent = previewName.charAt(0).toUpperCase();
          }
          if (settingsPreviewName) {
            settingsPreviewName.textContent = previewName;
          }
          if (settingsPreviewStatus) {
            settingsPreviewStatus.textContent = previewStatus;
          }

          applyTheme(previewTheme);
        };

        if (settingsName) settingsName.addEventListener("input", updatePreview);
        if (settingsStatus) settingsStatus.addEventListener("input", updatePreview);
        if (settingsTheme) settingsTheme.addEventListener("change", updatePreview);
      })
      .catch((error) => {
        console.error("Settings page auth error:", error);
        clearToken();
        window.location.href = "login.html";
      });
  }

  saveSettingsPageBtn.addEventListener("click", async () => {
    const displayName = document.getElementById("settingsName")?.value.trim() || "You";
    const status = document.getElementById("settingsStatus")?.value.trim() || "soft girl era";
    const theme = document.getElementById("settingsTheme")?.value || "soft";

    try {
      await apiFetch("/api/me", {
        method: "PUT",
        body: JSON.stringify({ displayName, status, theme })
      });

      window.location.href = "profile.html";
    } catch (error) {
      console.error("Settings save error:", error);
      alert(error.message || "Could not save settings.");
    }
  });

  const clearChatHistoryBtn = document.getElementById("clearChatHistoryBtn");
  if (clearChatHistoryBtn) {
    clearChatHistoryBtn.addEventListener("click", async () => {
      try {
        await apiFetch("/api/messages", { method: "DELETE" });
        alert("Chat history cleared.");
      } catch (error) {
        console.error("Clear chat history error:", error);
        alert(error.message || "Could not clear chat history.");
      }
    });
  }
}

/* ------------------------------ */
/* PROFILE PAGE */
/* ------------------------------ */
const profilePageName = document.getElementById("profilePageName");

if (profilePageName) {
  const token = getToken();

  if (!token) {
    window.location.href = "login.html";
  } else {
    Promise.all([loadCurrentUser(), apiFetch("/api/messages")])
      .then(([user, messagesData]) => {
        setProfileUI(user);

        const count = document.getElementById("profilePageMessageCount");
        if (count) {
          count.textContent = String((messagesData.messages || []).length);
        }
      })
      .catch((error) => {
        console.error("Profile page auth error:", error);
        clearToken();
        window.location.href = "login.html";
      });
  }

  const logoutProfileBtn = document.getElementById("logoutProfileBtn");
  if (logoutProfileBtn) {
    logoutProfileBtn.addEventListener("click", logoutUser);
  }
}

/* ------------------------------ */
/* HOME PAGE */
/* ------------------------------ */
if (document.body) {
  const token = getToken();
  if (!token) {
    applyTheme("soft");
  }
}