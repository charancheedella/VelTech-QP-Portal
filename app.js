const BASE_SHEET_URL =
"https://docs.google.com/spreadsheets/d/e/2PACX-1vQHE4ZvMKpU63EGL2QzCXSd3-mVtIt9fqJghuBn83G7aImWEA_0Z5a8UYgYGnU__-fuqe6h4NV7bE6N/pub?output=csv";

function getFreshURL() {
    return BASE_SHEET_URL + "&t=" + Date.now();
}

let papersData = [];
let currentDept = null;

const loader = document.getElementById("loader");
const papersContainer = document.getElementById("papers");
const searchInput = document.getElementById("searchInput");
const themeToggle = document.getElementById("themeToggle");

/* Loader control */
function setLoader(show) {
    loader.classList.toggle("hidden", !show);
}

/* Load data */
async function loadData() {
    setLoader(true);
    try {
        const res = await fetch(getFreshURL(), { cache: "no-store" });
        const text = await res.text();
        const rows = text.split("\n").slice(1);

        papersData = rows
            .filter(r => r.trim() !== "")
            .map((r) => {
                const parts = r.split(",");

                const subject = parts[0] || "";
                const dept = parts[1] || "";
                const years = parts[2] || "";
                const link = parts.slice(3).join(",") || "";   // safe for commas

                return {
                    subject: subject.trim(),
                    dept: dept.trim(),
                    years: years ? years.trim() : "—",
                    link: link.trim(),
                };
            });
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
        papersContainer.innerHTML += `
            <div class="paper-item">
                <div class="paper-left">
                    <div class="paper-title">${p.subject}</div>
                    <div class="paper-meta">${p.dept} | ${p.years}</div>
                </div>
                <a href="${p.link}" target="_blank">View Paper</a>
            </div>
        `;
    });
}

/* Load department */
async function loadDept(dept) {

    // If "Select Your Department" is chosen → go to home
    if (dept === "") {
        currentDept = null;
        papersContainer.innerHTML = "";
        document.getElementById("default-message-index").classList.remove("hidden");
        return;
    }

    currentDept = dept;

    document.getElementById("default-message-index").classList.add("hidden");

    await loadData();
    const filtered = papersData.filter(p => p.dept === dept);
    render(`${dept} Question Papers`, filtered);
}

/* Search functionality */
searchInput.addEventListener("input", async () => {
    const term = searchInput.value.toLowerCase();

    // Hide default screen when searching
    document.getElementById("default-message-index").classList.add("hidden");

    await loadData();

    if (!term) {
        papersContainer.innerHTML = "";
        return;
    }

    let filtered;

    if (currentDept) {
        filtered = papersData.filter(p =>
            p.dept === currentDept &&
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
});

/* Theme toggle */
themeToggle.addEventListener("click", () => {
    document.body.classList.toggle("dark");

    if (document.body.classList.contains("dark")) {
        themeToggle.textContent = "☀️"; // switch to light
    } else {
        themeToggle.textContent = "🌙"; // switch to dark
    }
});

/* Initial load */
loadData();
setInterval(loadData, 30000);
