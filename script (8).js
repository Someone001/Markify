/* ===========================================================================
   Markify — Live Attendance Scanner
   Application logic (face registration, recognition loop, attendance,
   lectures, storage, CSV export).
   Linked from index.html via: <script src="script.js"></script>
   =========================================================================== */

const video = document.getElementById('live-video');
const canvas = document.getElementById('recognition-canvas');
const ctx = canvas.getContext('2d');
const startBtn = document.getElementById('start-btn');
const stopBtn = document.getElementById('stop-btn');
const proxyBtn = document.getElementById('proxy-btn');
const modeBtn = document.getElementById('mode-btn');
const registerBtn = document.getElementById('register-btn');
const exportBtn = document.getElementById('export-btn');
const clearBtn = document.getElementById('clear-btn');
const statusText = document.getElementById('status-text');
const statusDot = document.getElementById('status-dot');
const logBody = document.getElementById('log-body');
const mismatchAlert = document.getElementById('mismatch-alert');
const successToast = document.getElementById('success-toast');
const toastText = document.getElementById('toast-text');
const perfLine = document.getElementById('perf-line');
const loadProgressBar = document.getElementById('load-progress-bar');
const loadProgressWrap = document.getElementById('load-progress-wrap');
const cameraContainer = document.getElementById('camera-container');
const viewfinderFrame = document.getElementById('viewfinder-frame');
const recIndicator = document.getElementById('rec-indicator');
const statRegistered = document.getElementById('stat-registered');
const statPresent = document.getElementById('stat-present');
const statAbsent = document.getElementById('stat-absent');
const statLiveFaces = document.getElementById('stat-live-faces');
const clockTime = document.getElementById('clock-time');
const clockDate = document.getElementById('clock-date');
const lectureSelect = document.getElementById('lecture-select');
const lectureSubjectLabel = document.getElementById('lecture-subject-label');
const lectureMetaLabel = document.getElementById('lecture-meta-label');
const newLectureBtn = document.getElementById('new-lecture-btn');
const logTitle = document.getElementById('log-title');
const bgCodeLayer = document.getElementById('bg-code-layer');

// Lecture modal elements
const lectureModal = document.getElementById('lecture-modal');
const closeLectureModalBtn = document.getElementById('close-lecture-modal-btn');
const createLectureBtn = document.getElementById('create-lecture-btn');
const lecSubject = document.getElementById('lec-subject');
const lecProfessor = document.getElementById('lec-professor');
const lecSection = document.getElementById('lec-section');

// Modal Elements
const modal = document.getElementById('registration-modal');
const openModalBtn = document.getElementById('open-modal-btn');
const closeModalBtn = document.getElementById('close-modal-btn');

const regName = document.getElementById('reg-name');
const regPrn = document.getElementById('reg-prn');
const regEmail = document.getElementById('reg-email');

let isStreaming = false;
let isProxyActive = false;
let isProcessingFrame = false;
let frameLoopTimeoutId = null;
let toastTimeout = null;
let currentStream = null;

let registeredFaces = [];
const attendanceMap = new Map(); // current lecture's attendance: prn -> {user, status, timestamp}

let lectures = [];              // {id, subject, professor, section}
let activeLectureId = null;
let attendanceByLecture = {};   // lectureId -> { prn: {status, timestamp} }

const STORAGE_KEY_FACES = 'attendance_registered_faces';
const STORAGE_KEY_ATTENDANCE = 'attendance_by_lecture';
const STORAGE_KEY_LECTURES = 'attendance_lectures';
const STORAGE_KEY_ACTIVE_LECTURE = 'attendance_active_lecture';
const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/';

// --- Live clock in header ---
function tickClock() {
    const now = new Date();
    clockTime.innerText = now.toLocaleTimeString();
    clockDate.innerText = now.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}
tickClock();
setInterval(tickClock, 1000);

// --- Ambient CS-themed background: drifting binary/code glyphs ---
// Purely decorative, generated once on load. Sits behind everything (z-index: -1)
// and is marked pointer-events: none so it never interferes with interaction.
function spawnBackgroundGlyphs() {
    const glyphs = ['01', '10', '101', '010', '0101', '1010', '{ }', '</>', 'fn()', '01001', '111000', '01010101', '#!/', '=>'];
    const count = 22;
    const frag = document.createDocumentFragment();
    for (let i = 0; i < count; i++) {
        const el = document.createElement('span');
        el.textContent = glyphs[Math.floor(Math.random() * glyphs.length)];
        const left = Math.random() * 100;
        const duration = 22 + Math.random() * 26;
        const delay = -Math.random() * duration;
        const size = 11 + Math.random() * 12;
        const drift = (Math.random() * 80 - 40).toFixed(0) + 'px';
        el.style.left = left + '%';
        el.style.fontSize = size.toFixed(0) + 'px';
        el.style.animationDuration = duration.toFixed(1) + 's';
        el.style.animationDelay = delay.toFixed(1) + 's';
        el.style.setProperty('--drift', drift);
        frag.appendChild(el);
    }
    bgCodeLayer.appendChild(frag);
}
spawnBackgroundGlyphs();

// --- Scan mode: trades detector input size for speed vs. reach ---
// 'single' -> smaller detector input, tighter loop. Best for one person at a time,
//             fastest possible recognition-to-attendance latency.
// 'group'  -> larger detector input, catches more/smaller faces in one frame at once.
//             Slightly slower per pass but handles a whole class in the frame.
// Both modes now mark attendance the instant a registered face is confidently matched -
// no waiting on any gesture. This trades the "did a real person actually stand there"
// liveness guarantee for speed: recognition-only matching can in principle be fooled by
// a photo held up to the camera, so keep that trade-off in mind for how you deploy this.
let scanMode = 'single';
const MODE_CONFIG = {
    // inputSize matches the resolution used at registration time (416) - keeping
    // these consistent makes live descriptors match the registered descriptor more
    // reliably (fewer "Unregistered" false negatives on a known face).
    single: { inputSize: 416, minFrameGapMs: 60 },
    group:  { inputSize: 512, minFrameGapMs: 120 }
};

openModalBtn.addEventListener('click', () => { modal.style.display = 'flex'; regName.focus(); });
closeModalBtn.addEventListener('click', () => modal.style.display = 'none');
newLectureBtn.addEventListener('click', () => { lectureModal.style.display = 'flex'; lecSubject.focus(); });
closeLectureModalBtn.addEventListener('click', () => lectureModal.style.display = 'none');
window.addEventListener('click', (e) => {
    if (e.target === modal) modal.style.display = 'none';
    if (e.target === lectureModal) lectureModal.style.display = 'none';
});
window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (modal.style.display === 'flex') modal.style.display = 'none';
    if (lectureModal.style.display === 'flex') lectureModal.style.display = 'none';
});

// --- Lecture management ---
// Attendance is tracked per lecture: switching the active lecture swaps in that
// lecture's saved records (defaulting everyone to Absent) without touching the
// roster of registered students, which is shared across all lectures.
function ensureDefaultLecture() {
    if (lectures.length === 0) {
        const id = 'lec_' + Date.now();
        lectures.push({ id, subject: 'General Lecture', professor: '—', section: '' });
        activeLectureId = id;
    }
    if (!activeLectureId || !lectures.some(l => l.id === activeLectureId)) {
        activeLectureId = lectures[0].id;
    }
}

function getActiveLecture() {
    return lectures.find(l => l.id === activeLectureId) || null;
}

function rebuildAttendanceMapForActiveLecture() {
    attendanceMap.clear();
    const records = attendanceByLecture[activeLectureId] || {};
    registeredFaces.forEach(user => {
        const rec = records[user.prn];
        attendanceMap.set(user.prn, {
            user,
            status: rec ? rec.status : 'Absent',
            timestamp: rec ? rec.timestamp : '-'
        });
    });
}

function renderLectureUI() {
    const active = getActiveLecture();
    lectureSubjectLabel.innerText = active ? active.subject : '—';
    lectureMetaLabel.innerText = active ? `Prof. ${active.professor}${active.section ? ' · ' + active.section : ''}` : '';
    logTitle.innerText = active ? `Attendance — ${active.subject}` : 'Student Attendance Log';

    lectureSelect.innerHTML = '';
    lectures.forEach(lec => {
        const opt = document.createElement('option');
        opt.value = lec.id;
        opt.innerText = `${lec.subject} — ${lec.professor}`;
        if (lec.id === activeLectureId) opt.selected = true;
        lectureSelect.appendChild(opt);
    });
}

function switchLecture(lectureId) {
    if (lectureId === activeLectureId) return;
    activeLectureId = lectureId;
    rebuildAttendanceMapForActiveLecture();
    renderLectureUI();
    renderAttendanceTable();
    saveToStorage();
}

lectureSelect.addEventListener('change', () => switchLecture(lectureSelect.value));

createLectureBtn.addEventListener('click', () => {
    const subject = lecSubject.value.trim();
    const professor = lecProfessor.value.trim();
    const section = lecSection.value.trim();

    if (!subject || !professor) {
        alert("Please fill in the Subject and Professor.");
        return;
    }

    const newLecture = { id: 'lec_' + Date.now(), subject, professor, section };
    lectures.push(newLecture);
    activeLectureId = newLecture.id;
    rebuildAttendanceMapForActiveLecture();
    renderLectureUI();
    renderAttendanceTable();
    saveToStorage();

    lecSubject.value = '';
    lecProfessor.value = '';
    lecSection.value = '';
    lectureModal.style.display = 'none';
});

function saveToStorage() {
    const serializableFaces = registeredFaces.map(user => ({
        ...user,
        descriptor: Array.from(user.descriptor)
    }));
    localStorage.setItem(STORAGE_KEY_FACES, JSON.stringify(serializableFaces));

    // Sync the in-memory map (current lecture) back into the per-lecture store
    // before persisting, since attendanceMap only ever reflects the active lecture.
    const currentRecords = {};
    attendanceMap.forEach((data, prn) => {
        currentRecords[prn] = { status: data.status, timestamp: data.timestamp };
    });
    attendanceByLecture[activeLectureId] = currentRecords;

    localStorage.setItem(STORAGE_KEY_ATTENDANCE, JSON.stringify(attendanceByLecture));
    localStorage.setItem(STORAGE_KEY_LECTURES, JSON.stringify(lectures));
    localStorage.setItem(STORAGE_KEY_ACTIVE_LECTURE, activeLectureId || '');
}

function loadFromStorage() {
    const savedFaces = localStorage.getItem(STORAGE_KEY_FACES);
    const savedLectures = localStorage.getItem(STORAGE_KEY_LECTURES);
    const savedAttendance = localStorage.getItem(STORAGE_KEY_ATTENDANCE);
    const savedActiveLecture = localStorage.getItem(STORAGE_KEY_ACTIVE_LECTURE);

    if (savedFaces) {
        const parsedFaces = JSON.parse(savedFaces);
        registeredFaces = parsedFaces.map(user => ({
            ...user,
            descriptor: new Float32Array(user.descriptor)
        }));
    }

    lectures = savedLectures ? JSON.parse(savedLectures) : [];
    attendanceByLecture = savedAttendance ? JSON.parse(savedAttendance) : {};
    activeLectureId = savedActiveLecture || null;

    ensureDefaultLecture();
    rebuildAttendanceMapForActiveLecture();
    renderLectureUI();
    renderAttendanceTable();
}

function setLoadProgress(pct, label) {
    loadProgressBar.style.width = pct + '%';
    if (label) statusText.innerText = label;
}

async function loadModels() {
    try {
        // Prefer WebGL backend explicitly - big speed difference over CPU fallback,
        // especially once we start throwing many faces at it per frame.
        try {
            await faceapi.tf.setBackend('webgl');
            await faceapi.tf.ready();
        } catch (backendErr) {
            console.warn('WebGL backend unavailable, falling back:', backendErr);
        }

        setLoadProgress(10, 'Loading face detector...');
        await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
        setLoadProgress(40, 'Loading landmark model...');
        await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
        setLoadProgress(70, 'Loading recognition model...');
        await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);

        setLoadProgress(85, 'Warming up models...');
        await warmUpModels();

        setLoadProgress(100, 'Models loaded. Ready to start camera.');
        setTimeout(() => { loadProgressWrap.style.display = 'none'; }, 600);

        loadFromStorage();

        startBtn.disabled = false;
        registerBtn.disabled = false;
    } catch (err) {
        console.error("Model loading error:", err);
        statusText.innerText = "Failed to load face recognition models.";
        statusDot.classList.add('error-dot');
    }
}

// Running one dummy detection right after load forces the backend to JIT/compile
// its kernels now, instead of on the user's first real frame - that first-frame
// stall is a big part of why the app can feel like it "takes forever" to start.
async function warmUpModels() {
    try {
        const dummyCanvas = document.createElement('canvas');
        dummyCanvas.width = 320;
        dummyCanvas.height = 240;
        await faceapi.detectAllFaces(dummyCanvas, new faceapi.TinyFaceDetectorOptions({ inputSize: 320 }))
            .withFaceLandmarks()
            .withFaceDescriptors();
    } catch (e) {
        // Warm-up failures are non-fatal, just means first real frame will be a bit slower.
        console.warn('Warm-up pass skipped:', e);
    }
}

window.addEventListener('DOMContentLoaded', loadModels);

async function startCamera() {
    try {
        statusText.innerText = "Requesting Camera Access...";
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: false
        });
        video.srcObject = stream;
        currentStream = stream;
        isStreaming = true;
        cameraContainer.classList.add('streaming');

        startBtn.style.display = 'none';
        stopBtn.style.display = 'inline-flex';
        proxyBtn.disabled = false;
        modeBtn.disabled = false;
        statusDot.className = 'status-dot active-dot';
        statusText.innerText = "Camera Active. Click 'Recognition' to start.";
    } catch (err) {
        statusDot.classList.add('error-dot');
        statusText.innerText = "Camera Access Denied";
        alert("Could not access camera.");
    }
}

function stopCamera() {
    if (!isStreaming) return;

    // Turn off recognition first so the frame loop stops cleanly.
    if (isProxyActive) {
        isProxyActive = false;
        proxyBtn.innerText = "◎ Recognition: OFF";
        proxyBtn.classList.remove('active');
        viewfinderFrame.classList.remove('show');
        recIndicator.classList.remove('show');
        stopFrameLoop();
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        mismatchAlert.classList.remove('show');
    }

    // Release the camera hardware.
    if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
        currentStream = null;
    }
    video.srcObject = null;
    isStreaming = false;
    cameraContainer.classList.remove('streaming');

    // Restore the UI back to its pre-start state.
    stopBtn.style.display = 'none';
    startBtn.style.display = 'inline-flex';
    proxyBtn.disabled = true;
    modeBtn.disabled = true;
    statusDot.className = 'status-dot';
    statusText.innerText = "Camera Stopped.";
    statLiveFaces.innerText = '0';
}

video.addEventListener('loadedmetadata', () => {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
});

modeBtn.addEventListener('click', () => {
    scanMode = scanMode === 'single' ? 'group' : 'single';
    if (scanMode === 'single') {
        modeBtn.innerText = 'Mode: Single';
        modeBtn.classList.remove('on');
    } else {
        modeBtn.innerText = 'Mode: Group';
        modeBtn.classList.add('on');
    }
});

// Toggle Recognition Mode
proxyBtn.addEventListener('click', () => {
    if (!isStreaming) return;

    isProxyActive = !isProxyActive;

    if (isProxyActive) {
        proxyBtn.innerText = "◎ Recognition: ON";
        proxyBtn.classList.add('active');
        modeBtn.disabled = true; // avoid switching mid-scan
        statusDot.className = "status-dot proxy-dot";
        statusText.innerText = "Recognition Active";
        viewfinderFrame.classList.add('show');
        recIndicator.classList.add('show');
        startFrameLoop();
    } else {
        proxyBtn.innerText = "◎ Recognition: OFF";
        proxyBtn.classList.remove('active');
        modeBtn.disabled = false;
        statusDot.className = "status-dot active-dot";
        statusText.innerText = "Camera Active (Recognition Paused)";
        viewfinderFrame.classList.remove('show');
        recIndicator.classList.remove('show');
        stopFrameLoop();
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        mismatchAlert.classList.remove('show');
        statLiveFaces.innerText = '0';
    }
});

// --- Self-paced recognition loop ---
// Using setInterval(fn, N) with an async fn is a trap here: if a single pass takes
// longer than N ms (easy once there's more than one face, or on a slower device), calls
// pile up faster than they can finish and the video appears to "lag" behind reality.
// This loop instead waits for each pass to fully finish before scheduling the next one,
// so it always runs at the fastest rate the device can actually sustain.
function startFrameLoop() {
    stopFrameLoop();
    frameLoopTimeoutId = setTimeout(runFrameLoopTick, 0);
}

function stopFrameLoop() {
    if (frameLoopTimeoutId) {
        clearTimeout(frameLoopTimeoutId);
        frameLoopTimeoutId = null;
    }
    isProcessingFrame = false;
}

async function runFrameLoopTick() {
    if (!isProxyActive || !isStreaming) return;
    if (isProcessingFrame) return; // safety guard, shouldn't happen given the await below

    isProcessingFrame = true;
    const t0 = performance.now();
    let faceCount = 0;
    try {
        faceCount = await processProxyFrame();
    } catch (e) {
        console.error('Frame processing error:', e);
    }
    const elapsed = performance.now() - t0;
    isProcessingFrame = false;

    const minGap = MODE_CONFIG[scanMode].minFrameGapMs;
    perfLine.innerText = `FACES: ${faceCount} · LAST PASS: ${elapsed.toFixed(0)} ms · MODE: ${scanMode}`;
    statLiveFaces.innerText = String(faceCount);

    if (!isProxyActive) return;
    const nextDelay = Math.max(minGap - elapsed, 10);
    frameLoopTimeoutId = setTimeout(runFrameLoopTick, nextDelay);
}

// Core Recognition Engine. Returns number of faces detected this pass (used for the
// perf readout). Attendance is marked the instant a registered face is confidently
// matched - no gesture or wait required.
async function processProxyFrame() {
    if (!isStreaming || !isProxyActive) return 0;

    const config = MODE_CONFIG[scanMode];
    const detectorOptions = new faceapi.TinyFaceDetectorOptions({
        inputSize: config.inputSize,
        scoreThreshold: 0.5
    });

    const detections = await faceapi.detectAllFaces(video, detectorOptions)
        .withFaceLandmarks()
        .withFaceDescriptors();

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    let hasUnregisteredFace = false;

    if (detections.length > 0) {
        const resizedDetections = faceapi.resizeResults(detections, {
            width: canvas.width,
            height: canvas.height
        });

        resizedDetections.forEach(detection => {
            const { box } = detection.detection;
            const descriptor = detection.descriptor;

            let bestMatch = null;
            let lowestDistance = 0.55; // Matching threshold - lower = stricter match

            registeredFaces.forEach(user => {
                const distance = faceapi.euclideanDistance(descriptor, user.descriptor);
                if (distance < lowestDistance) {
                    lowestDistance = distance;
                    bestMatch = user;
                }
            });

            if (bestMatch) {
                // Instant match: mark present the moment a registered face is confidently
                // recognized. markStudentPresent() itself no-ops on repeat matches (it only
                // writes/toasts the first time a student flips from Absent to Present), so
                // this is safe to call on every frame the face is visible.
                const record = attendanceMap.get(bestMatch.prn);
                const alreadyPresent = record && record.status === 'Present';
                markStudentPresent(bestMatch);
                drawBox(box.x, box.y, box.width, box.height, `${bestMatch.name}${alreadyPresent ? ' · PRESENT' : ''}`, '#4ade80');
            } else {
                drawBox(box.x, box.y, box.width, box.height, "UNREGISTERED", '#fb5c74');
                hasUnregisteredFace = true;
            }
        });
    }

    if (hasUnregisteredFace) {
        mismatchAlert.classList.add('show');
    } else {
        mismatchAlert.classList.remove('show');
    }

    return detections.length;
}

function drawBox(x, y, w, h, label, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.strokeRect(x, y, w, h);

    ctx.font = "600 13px 'JetBrains Mono', monospace";
    const paddingX = 8;
    const textWidth = ctx.measureText(label).width;

    ctx.fillStyle = color;
    ctx.fillRect(x, Math.max(0, y - 24), textWidth + paddingX * 2, 22);

    ctx.fillStyle = '#06090e';
    ctx.fillText(label, x + paddingX, Math.max(16, y - 8));
}

function triggerSuccessAnimation(studentName) {
    toastText.innerText = `PRESENT: ${studentName}`;
    successToast.classList.add('show');

    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
        successToast.classList.remove('show');
    }, 3000);
}

function markStudentPresent(user) {
    const record = attendanceMap.get(user.prn);
    if (record && record.status !== 'Present') {
        record.status = 'Present';
        record.timestamp = new Date().toLocaleTimeString();
        saveToStorage();
        renderAttendanceTable();
        triggerSuccessAnimation(user.name);
    }
}

// Register New Student
registerBtn.addEventListener('click', async () => {
    if (!isStreaming) {
        alert("Please start the camera first before registering a face!");
        return;
    }

    const name = regName.value.trim();
    const prn = regPrn.value.trim();
    const email = regEmail.value.trim();

    if (!name || !prn || !email) {
        alert("Please fill in Name, PRN, and Email.");
        return;
    }

    if (attendanceMap.has(prn)) {
        alert(`Student with PRN "${prn}" is already registered.`);
        return;
    }

    const detection = await faceapi.detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 416 }))
        .withFaceLandmarks()
        .withFaceDescriptor();

    if (!detection) {
        alert("No face detected! Make sure your face is clearly visible in the camera.");
        return;
    }

    const newUser = {
        id: Date.now(),
        name,
        prn,
        email,
        descriptor: detection.descriptor
    };

    registeredFaces.push(newUser);

    attendanceMap.set(prn, {
        user: newUser,
        status: 'Absent',
        timestamp: '-'
    });

    saveToStorage();
    renderAttendanceTable();

    regName.value = '';
    regPrn.value = '';
    regEmail.value = '';
    modal.style.display = 'none';

    alert(`Successfully registered ${name}!`);
});

// Smoothly counts a stat element from its current displayed value to a new one,
// eased with the same curve used across the rest of the UI's motion.
function animateStatTo(el, target) {
    const start = parseInt(el.innerText, 10) || 0;
    if (start === target) { el.innerText = String(target); return; }
    const duration = 420;
    const t0 = performance.now();
    const easeOutExpo = (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));
    function step(now) {
        const progress = Math.min((now - t0) / duration, 1);
        const eased = easeOutExpo(progress);
        const value = Math.round(start + (target - start) * eased);
        el.innerText = String(value);
        if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
}

function updateStats() {
    let present = 0;
    attendanceMap.forEach((data) => { if (data.status === 'Present') present += 1; });
    const total = attendanceMap.size;
    animateStatTo(statRegistered, total);
    animateStatTo(statPresent, present);
    animateStatTo(statAbsent, total - present);
}

function removeStudent(prn) {
    const record = attendanceMap.get(prn);
    const label = record ? `${record.user.name} (PRN ${prn})` : `PRN ${prn}`;
    if (!confirm(`Remove ${label} and all their attendance data? This cannot be undone.`)) return;

    registeredFaces = registeredFaces.filter(u => u.prn !== prn);
    attendanceMap.delete(prn);
    // Also strip this student out of every other lecture's saved records.
    Object.keys(attendanceByLecture).forEach(lectureId => {
        if (attendanceByLecture[lectureId] && attendanceByLecture[lectureId][prn]) {
            delete attendanceByLecture[lectureId][prn];
        }
    });

    saveToStorage();
    renderAttendanceTable();
}

// Event delegation: one listener on the table body handles delete clicks for
// every row, including rows added after this listener was attached.
logBody.addEventListener('click', (e) => {
    const btn = e.target.closest('.row-delete-btn');
    if (!btn) return;
    removeStudent(btn.dataset.prn);
});

function renderAttendanceTable() {
    logBody.innerHTML = '';

    if (attendanceMap.size === 0) {
        logBody.innerHTML = '<tr class="empty-row"><td colspan="6">No students registered yet.</td></tr>';
        updateStats();
        return;
    }

    attendanceMap.forEach((data) => {
        const row = document.createElement('tr');
        const badgeClass = data.status === 'Present' ? 'present-badge' : 'absent-badge';
        row.innerHTML = `
            <td><strong>${data.user.name}</strong></td>
            <td>${data.user.prn}</td>
            <td>${data.user.email}</td>
            <td>${data.timestamp}</td>
            <td><span class="badge ${badgeClass}">${data.status}</span></td>
            <td><button class="row-delete-btn" type="button" data-prn="${data.user.prn}" title="Remove this student">🗑</button></td>
        `;
        logBody.appendChild(row);
    });

    updateStats();
}

clearBtn.addEventListener('click', () => {
    if (confirm("Are you sure you want to clear ALL registered students and every lecture's attendance data?")) {
        localStorage.removeItem(STORAGE_KEY_FACES);
        localStorage.removeItem(STORAGE_KEY_ATTENDANCE);
        localStorage.removeItem(STORAGE_KEY_LECTURES);
        localStorage.removeItem(STORAGE_KEY_ACTIVE_LECTURE);
        registeredFaces = [];
        attendanceMap.clear();
        lectures = [];
        attendanceByLecture = {};
        activeLectureId = null;
        ensureDefaultLecture();
        renderLectureUI();
        renderAttendanceTable();
        saveToStorage();
        alert("Storage cleared successfully.");
    }
});

exportBtn.addEventListener('click', () => {
    if (attendanceMap.size === 0) {
        alert("No student records available to export.");
        return;
    }

    const active = getActiveLecture();
    const csvRows = [];
    csvRows.push(['Subject', 'Professor', 'Name', 'PRN/ID', 'Email', 'Timestamp', 'Status'].join(','));

    attendanceMap.forEach((data) => {
        const rowData = [
            active ? active.subject : '',
            active ? active.professor : '',
            data.user.name, data.user.prn, data.user.email, data.timestamp, data.status
        ].map(val => `"${String(val).replace(/"/g, '""')}"`);
        csvRows.push(rowData.join(','));
    });

    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const subjectSlug = active ? active.subject.replace(/[^a-z0-9]+/gi, '_') : 'attendance';

    const downloadLink = document.createElement('a');
    downloadLink.href = url;
    downloadLink.setAttribute('download', `${subjectSlug}_${dateStr}.csv`);
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
    URL.revokeObjectURL(url);
});

startBtn.addEventListener('click', startCamera);
stopBtn.addEventListener('click', stopCamera);
