const BASE_SHEET_URL =
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vQHE4ZvMKpU63EGL2QzCXSd3-mVtIt9fqJghuBn83G7aImWEA_0Z5a8UYgYGnU__-fuqe6h4NV7bE6N/pub?output=csv";
const REQUESTS_SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQHE4ZvMKpU63EGL2QzCXSd3-mVtIt9fqJghuBn83G7aImWEA_0Z5a8UYgYGnU__-fuqe6h4NV7bE6N/pub?gid=2081507962&single=true&output=csv";

function getFreshURL(baseUrl) {
    return baseUrl + "&t=" + Date.now();
}

let papersData = [];
let currentDept = null;
let favorites = JSON.parse(localStorage.getItem('veltech_favorites')) || [];
let recents = JSON.parse(localStorage.getItem('veltech_recents')) || [];
let knownPapers = JSON.parse(localStorage.getItem('veltech_known_papers'));
let newPapersDict = JSON.parse(localStorage.getItem('veltech_new_papers')) || {};

// Simple hash function for short IDs
const generateShortId = (str) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = (hash << 5) - hash + str.charCodeAt(i);
        hash |= 0; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
};

// Robust CSV Row Parser
function parseCSVRow(text) {
    let result = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
        let char = text[i];
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = "";
        } else {
            current += char;
        }
    }
    result.push(current.trim());
    return result;
}

// Base departments that should always appear in the dropdown even if empty
const BASE_DEPTS = {
    "FME": "First Year",
    "CSE": "CSE",
    "ECE": "ECE",
    "CSD": "CSD",
    "BIOTECH": "Biotech",
    "EEE": "EEE",
    "MECH": "Mechanical",
    "FOUNDATION": "Foundation",
    "OPEN ELECTIVE": "Open Elective",
    "PPC": "PPC"
};

function populateDropdown() {
    const deptDropdown = document.getElementById("deptDropdown");
    const currentValue = deptDropdown.value;

    const allDepts = new Set(Object.keys(BASE_DEPTS));
    papersData.forEach(p => {
        p.dept.split(',').forEach(d => {
            const dt = d.trim();
            if (dt && dt !== '-') allDepts.add(dt);
        });
    });

    deptDropdown.innerHTML = `<option value="">Select Your Department</option>`;

    Array.from(allDepts).sort().forEach(d => {
        const option = document.createElement("option");
        option.value = d;
        option.textContent = BASE_DEPTS[d] || d;
        deptDropdown.appendChild(option);
    });

    if (allDepts.has(currentValue)) {
        deptDropdown.value = currentValue;
    } else if (currentValue !== "") {
        currentDept = null;
        deptDropdown.value = "";
    }
}

const loader = document.getElementById("loader");
const papersContainer = document.getElementById("papers");
const searchInput = document.getElementById("searchInput");
const themeToggle = document.getElementById("themeToggle");
const favoritesBtn = document.getElementById("favoritesBtn");

/* Helper Functions for Features */
function toggleFavorite(id) {
    if (favorites.includes(id)) {
        favorites = favorites.filter(f => f !== id);
    } else {
        favorites.push(id);
        showToast("Added to Favorites ❤️");
    }
    localStorage.setItem('veltech_favorites', JSON.stringify(favorites));

    // Update UI immediately
    const btn = document.querySelector(`.fav-btn[data-id="${id}"]`);
    if (btn) {
        btn.classList.toggle("active");
        const svg = btn.querySelector('svg');
        if (favorites.includes(id)) {
            svg.setAttribute('fill', '#ff3b30');
            svg.setAttribute('stroke', '#ff3b30');
        } else {
            svg.setAttribute('fill', 'none');
            svg.setAttribute('stroke', 'currentColor');
        }
    }
}

function recordView(id) {
    recents = recents.filter(r => r !== id);
    recents.unshift(id);
    if (recents.length > 4) recents.pop();
    localStorage.setItem('veltech_recents', JSON.stringify(recents));
    renderRecents();
}

function sharePaper(id) {
    const url = window.location.origin + window.location.pathname + "?p=" + id;
    navigator.clipboard.writeText(url).then(() => {
        showToast("Link copied! Ready to share 🔗");
    }).catch(() => {
        showToast("Failed to copy link.");
    });
}

function showToast(msg) {
    const toast = document.getElementById("toast");
    toast.textContent = msg;
    toast.classList.remove("hidden");
    toast.classList.add("show");
    setTimeout(() => {
        toast.classList.remove("show");
        toast.classList.add("hidden");
    }, 3000);
}

function renderRecents() {
    const recentSection = document.getElementById("recently-viewed-section");
    const recentContainer = document.getElementById("recent-papers");

    // Only show recents on the homepage when no dept is selected and no search
    if (currentDept || searchInput.value || recents.length === 0) {
        recentSection.classList.add("hidden");
        return;
    }

    recentSection.classList.remove("hidden");
    recentContainer.innerHTML = "";

    recents.forEach(id => {
        const p = papersData.find(paper => paper.id === id);
        if (p) {
            recentContainer.innerHTML += `
                <div class="recent-card" onclick="window.open('${p.link}', '_blank'); recordView('${p.id}')">
                    <div class="recent-title">${p.subject}</div>
                    <div class="recent-meta">${p.dept} | ${p.years}</div>
                </div>
            `;
        }
    });
}

/* Loader control */
function setLoader(show) {
    loader.classList.toggle("hidden", !show);
}

/* Request logic */
async function fetchRequests() {
    const tickerContent = document.querySelector('.ticker-content');
    if (tickerContent) tickerContent.innerHTML = "<span>Checking for new requests...</span>";

    try {
        const url = REQUESTS_SHEET_URL.includes('?')
            ? `${REQUESTS_SHEET_URL}&nocache=${Date.now()}`
            : `${REQUESTS_SHEET_URL}?nocache=${Date.now()}`;

        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error("Fetch failed");

        const text = await res.text();
        // Split by any newline character (\n or \r\n)
        const rows = text.split(/\r?\n/);

        const requests = rows
            .filter(r => r.trim() !== "")
            .map(r => {
                // Split by comma and only take the first column (Subject)
                const parts = r.split(',');
                return parts[0].replace(/^"|"$/g, '').trim();
            });

        console.log("Fetched requests:", requests);
        updateRequestsUI(requests);
    } catch (e) {
        console.error("Requests failed:", e);
        if (tickerContent) tickerContent.innerHTML = "<span>Unable to load requests at the moment.</span>";
    }
}

function updateRequestsUI(requests) {
    const tickerContent = document.querySelector('.ticker-content');
    const requestedList = document.querySelector('.requested-list');

    if (!tickerContent || !requestedList) return;

    if (!requests || requests.length === 0) {
        tickerContent.innerHTML = "<span>No active requests. Have a paper? Contribute below!</span>";
        requestedList.innerHTML = "<li>No papers currently requested.</li>";
        return;
    }

    // Update Ticker (Duplicate items to ensure seamless loop if short)
    const displayItems = requests.length < 3 ? [...requests, ...requests, ...requests] : requests;
    tickerContent.innerHTML = displayItems.map(req => `<span>Seeking: ${req}</span>`).join('') +
        `<span>Have these? Contribute & help your fellow students!</span>`;

    // Update List
    requestedList.innerHTML = requests.map(req => `<li>${req}</li>`).join('');
}

/* Load data */
async function loadData() {
    setLoader(true);
    try {
        // Fetch Main Papers
        const res = await fetch(getFreshURL(BASE_SHEET_URL), { cache: "no-store" });
        const text = await res.text();
        const rows = text.split("\n").slice(1);

        // Fetch Requests (Quietly)
        fetchRequests();

        papersData = rows
            .filter(r => r.trim() !== "")
            .map((r) => {
                const parts = parseCSVRow(r);

                const subject = parts[0] || "";
                const dept = parts[1] || "";
                const years = parts[2] || "";
                const notes = (parts[3] || "").replace(/^"|"$/g, '').trim();
                const link = parts[4] || "";
                const clicks = parseInt(parts[5]) || 0;

                // Create unique, short URL-safe ID based on subject and dept
                const id = generateShortId(subject.trim() + dept.trim());

                return {
                    id: id,
                    subject: subject.trim(),
                    dept: dept.trim(),
                    years: years ? years.trim() : "—",
                    notes: notes,
                    clicks: clicks,
                    link: link.trim(),
                };
            });

        populateDropdown();

    } finally {
        setLoader(false);
    }
}

/* Render papers */
function render(title, data) {
    papersContainer.innerHTML = "";

    if (title) {
        papersContainer.innerHTML += `<div class="section-title">${title}</div>`;
    }

    if (!data.length) {
        papersContainer.innerHTML += `
            <div class="no-papers-box">
                <div class="no-papers-lottie">
                    <dotlottie-wc
                      src="https://lottie.host/0fe35754-a246-4f6c-9799-2d58d0e7a785/XQZGvmrySm.lottie"
                      style="width: 400px;height: 300px"
                      autoplay
                      loop
                    ></dotlottie-wc>
                </div>

                <p class="no-papers-text">
                    No papers uploaded for this department yet.<br>
                    Hang tight - They’re on the way ❤️
                </p>
            </div>
        `;
        return;
    }

    data.forEach(p => {
        const isFav = favorites.includes(p.id);
        const newClass = p.isNew ? "new-paper" : "";

        papersContainer.innerHTML += `
            <div class="paper-item ${newClass}">
                <div class="paper-left">
                    <div class="paper-title">${p.subject}</div>
                    <div class="paper-meta">
                        <span>${p.dept} | ${p.years}</span>
                    </div>
                    ${p.notes ? `<div class="paper-notes"> ${p.notes}</div>` : ''}
                    ${p.clicks > 0 ? `
                        <div class="view-status-pill ${p.clicks >= 25 ? 'trending' : ''}">
                            <span class="status-dot"></span>
                            <span>${p.clicks >= 30 ? `${p.clicks} Views 🔥 Trending Now!` : `${p.clicks} Views`}</span>
                        </div>
                    ` : ''}
                </div>
                <div class="paper-actions">
                    <button class="action-btn fav-btn ${isFav ? 'active' : ''}" data-id="${p.id}" onclick="toggleFavorite('${p.id}')" title="Favorite">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="${isFav ? '#ff3b30' : 'none'}" stroke="${isFav ? '#ff3b30' : 'currentColor'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                        </svg>
                    </button>
                    <button class="action-btn share-btn" onclick="sharePaper('${p.id}')" title="Share Link">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                        </svg>
                    </button>
                    <a href="${p.link}" target="_blank" onclick="reportClick('${p.subject}'); recordView('${p.id}')">View Paper</a>
                </div>
            </div>
        `;
    });
}

/* Load department */
async function loadDept(dept) {
    if (dept === "") {
        currentDept = null;
        papersContainer.innerHTML = "";
        document.getElementById("default-message-index").classList.remove("hidden");
        return;
    }
    currentDept = dept;
    document.getElementById("default-message-index").classList.add("hidden");
    await loadData();
    const filtered = papersData.filter(p => p.dept.split(',').map(d => d.trim()).includes(dept));
    render(`${dept} Question Papers`, filtered);
}

/* Search functionality with debounce */
let searchTimeout;
searchInput.addEventListener("input", () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(async () => {
        const term = searchInput.value.toLowerCase();
        document.getElementById("default-message-index").classList.add("hidden");
        await loadData();
        if (!term) {
            papersContainer.innerHTML = "";
            if (!currentDept) {
                document.getElementById("default-message-index").classList.remove("hidden");
                renderRecents();
            } else {
                loadDept(currentDept);
            }
            return;
        }
        let filtered;
        if (currentDept) {
            filtered = papersData.filter(p =>
                p.dept.split(',').map(d => d.trim()).includes(currentDept) &&
                p.subject.toLowerCase().includes(term)
            );
            render(`Search in ${currentDept}`, filtered);
        } else {
            filtered = papersData.filter(p =>
                p.subject.toLowerCase().includes(term) ||
                p.dept.toLowerCase().includes(term)
            );
            render(`Global Search`, filtered);
        }
    }, 300);
});

/* Favorites View Toggle */
let showingFavorites = false;
favoritesBtn.addEventListener("click", async () => {
    showingFavorites = !showingFavorites;
    if (showingFavorites) {
        currentDept = null;
        document.getElementById("deptDropdown").value = "";
        document.getElementById("default-message-index").classList.add("hidden");
        searchInput.value = "";
        favoritesBtn.style.background = "#ffcccc";
        await loadData();
        const favPapers = papersData.filter(p => favorites.includes(p.id));
        render("Your Favorite Papers ⭐️", favPapers);
    } else {
        favoritesBtn.style.background = "";
        papersContainer.innerHTML = "";
        document.getElementById("default-message-index").classList.remove("hidden");
        renderRecents();
    }
});

/* Theme toggle */
themeToggle.addEventListener("click", () => {
    document.body.classList.toggle("dark");
    themeToggle.textContent = document.body.classList.contains("dark") ? "☀️" : "🌙";
});

async function reportClick(subject) {
    const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwRWcoOPg0zK0Ay9aIH5nd01ULBCEvcikYsyJZTZcjA1wb149qJ5ZV6uw0q8CuD-UTI2A/exec";
    try {
        await fetch(SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            body: JSON.stringify({ type: 'click', subject: subject })
        });
    } catch (e) { console.error("Click report failed", e); }
}

/* Form switch logic */
function switchContactTab(tab) {
    const feedbackForm = document.getElementById('feedbackForm');
    const contributeView = document.getElementById('contributeView');
    const btnFeedback = document.getElementById('toggleFeedback');
    const btnContribute = document.getElementById('toggleContribute');
    if (tab === 'feedback') {
        feedbackForm.classList.remove('hidden');
        contributeView.classList.add('hidden');
        btnFeedback.classList.add('active');
        btnContribute.classList.remove('active');
    } else {
        feedbackForm.classList.add('hidden');
        contributeView.classList.remove('hidden');
        btnFeedback.classList.remove('active');
        btnContribute.classList.add('active');
    }
}
window.switchContactTab = switchContactTab;

/* Intercept Feedback Form Submission */
const feedbackForm = document.getElementById('feedbackForm');
if (feedbackForm) {
    feedbackForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = feedbackForm.querySelector('.submit-btn');
        const originalText = submitBtn.textContent;
        submitBtn.textContent = "Sending...";
        submitBtn.disabled = true;
        try {
            const formData = new FormData(feedbackForm);
            const data = Object.fromEntries(formData.entries());
            const response = await fetch(feedbackForm.action, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                body: JSON.stringify(data),
            });
            if (response.ok) {
                showToast("Feedback sent successfully! ❤️");
                feedbackForm.reset();
            } else {
                showToast("Failed to send. Please try again.");
            }
        } catch (error) {
            showToast("An error occurred. Please try again.");
        } finally {
            submitBtn.textContent = originalText;
            submitBtn.disabled = false;
        }
    });
}

/* Initial load */
async function init() {
    await loadData();
    const urlParams = new URLSearchParams(window.location.search);
    const sharedId = urlParams.get('p');
    if (sharedId) {
        const sharedPaper = papersData.find(p => p.id === sharedId);
        if (sharedPaper) {
            document.getElementById("default-message-index").classList.add("hidden");
            render("Shared Paper", [sharedPaper]);
            return;
        }
    }
    renderRecents();
}

init();
setInterval(loadData, 60000);
