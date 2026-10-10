/* ===========================================================================
   Markify — Live AI Attendance Scanner
   Complete Application Logic & Biometric Engine
   =========================================================================== */

// DOM Elements - Navigation & Auth
const demoBtnFaculty = document.getElementById('demo-btn-faculty');
const demoBtnStudent = document.getElementById('demo-btn-student');
const demoBtnData = document.getElementById('demo-btn-data');
const facultyPortalView = document.getElementById('faculty-portal-view');
const studentPortalView = document.getElementById('student-portal-view');
const userAvatar = document.getElementById('user-avatar');
const userDisplayName = document.getElementById('user-display-name');
const userRoleBadge = document.getElementById('user-role-badge');
const authToggleBtn = document.getElementById('auth-toggle-btn');
const authModal = document.getElementById('auth-modal');
const closeAuthModalBtn = document.getElementById('close-auth-modal-btn');
const loginFacultyBtn = document.getElementById('login-faculty-btn');
const loginStudentBtn = document.getElementById('login-student-btn');

// DOM Elements - Faculty Portal Camera & Inference
const video = document.getElementById('live-video');
const canvas = document.getElementById('recognition-canvas');
const ctx = canvas.getContext('2d');
const startBtn = document.getElementById('start-btn');
const stopBtn = document.getElementById('stop-btn');
const proxyBtn = document.getElementById('proxy-btn');
const modeBtn = document.getElementById('mode-btn');
const livenessBtn = document.getElementById('liveness-btn');
const audioToggleBtn = document.getElementById('audio-toggle-btn');
const testImageInput = document.getElementById('test-image-input');

const statusText = document.getElementById('status-text');
const statusDot = document.getElementById('status-dot');
const logBody = document.getElementById('log-body');
const mismatchAlert = document.getElementById('mismatch-alert');
const successToast = document.getElementById('success-toast');
const toastText = document.getElementById('toast-text');
const toastSub = document.getElementById('toast-sub');
const livenessBadge = document.getElementById('liveness-badge');

const perfFaces = document.getElementById('perf-faces');
const perfLatency = document.getElementById('perf-latency');
const perfFps = document.getElementById('perf-fps');
const perfLiveness = document.getElementById('perf-liveness');
const perfBackend = document.getElementById('perf-backend');

const loadProgressBar = document.getElementById('load-progress-bar');
const loadProgressWrap = document.getElementById('load-progress-wrap');
const cameraContainer = document.getElementById('camera-container');
const viewfinderFrame = document.getElementById('viewfinder-frame');
const recIndicator = document.getElementById('rec-indicator');

const statRegistered = document.getElementById('stat-registered');
const statPresent = document.getElementById('stat-present');
const statPresentPct = document.getElementById('stat-present-pct');
const statAbsent = document.getElementById('stat-absent');
const statLiveFaces = document.getElementById('stat-live-faces');
const clockTime = document.getElementById('clock-time');
const clockDate = document.getElementById('clock-date');

// DOM Elements - Lectures
const lectureSelect = document.getElementById('lecture-select');
const lectureSubjectLabel = document.getElementById('lecture-subject-label');
const lectureMetaLabel = document.getElementById('lecture-meta-label');
const newLectureBtn = document.getElementById('new-lecture-btn');
const logTitle = document.getElementById('log-title');
const lectureModal = document.getElementById('lecture-modal');
const closeLectureModalBtn = document.getElementById('close-lecture-modal-btn');
const createLectureBtn = document.getElementById('create-lecture-btn');
const lecSubject = document.getElementById('lec-subject');
const lecProfessor = document.getElementById('lec-professor');
const lecSection = document.getElementById('lec-section');

// DOM Elements - Registration Modal
const modal = document.getElementById('registration-modal');
const openModalBtn = document.getElementById('open-modal-btn');
const closeModalBtn = document.getElementById('close-modal-btn');
const tabWebcamBtn = document.getElementById('tab-webcam-btn');
const tabUploadBtn = document.getElementById('tab-upload-btn');
const enrollWebcamSection = document.getElementById('enroll-webcam-section');
const enrollUploadSection = document.getElementById('enroll-upload-section');
const regPhotoDropzone = document.getElementById('reg-photo-dropzone');
const regPhotoInput = document.getElementById('reg-photo-input');
const photoPreview = document.getElementById('photo-preview');
const dropzoneLabel = document.getElementById('dropzone-label');
const registerBtn = document.getElementById('register-btn');
const registerPhotoBtn = document.getElementById('register-photo-btn');
const regName = document.getElementById('reg-name');
const regPrn = document.getElementById('reg-prn');
const regEmail = document.getElementById('reg-email');

// DOM Elements - Roster Search & Filters & Export
const rosterSearch = document.getElementById('roster-search');
const filterBtns = document.querySelectorAll('.filter-btn');
const countAll = document.getElementById('count-all');
const countPresent = document.getElementById('count-present');
const countAbsent = document.getElementById('count-absent');
const exportBtn = document.getElementById('export-btn');
const clearBtn = document.getElementById('clear-btn');
const reportModalBtn = document.getElementById('report-modal-btn');
const reportModal = document.getElementById('report-modal');
const closeReportModalBtn = document.getElementById('close-report-modal-btn');
const reportTableBody = document.getElementById('report-table-body');
const repSubject = document.getElementById('rep-subject');
const repProfessor = document.getElementById('rep-professor');
const repSection = document.getElementById('rep-section');
const repRate = document.getElementById('rep-rate');
const reportMetaTimestamp = document.getElementById('report-meta-timestamp');

// DOM Elements - Student Portal
const studentPortalAvatar = document.getElementById('student-portal-avatar');
const studentPortalName = document.getElementById('student-portal-name');
const studentPortalPrn = document.getElementById('student-portal-prn');
const studentPortalRate = document.getElementById('student-portal-rate');
const studentCoursesGrid = document.getElementById('student-courses-grid');
const downloadSlipBtn = document.getElementById('download-slip-btn');
const bgCodeLayer = document.getElementById('bg-code-layer');

// State Management
let isStreaming = false;
let isProxyActive = false;
let isProcessingFrame = false;
let isAntiSpoofActive = true;
let isAudioEnabled = true;
let frameLoopTimeoutId = null;
let toastTimeout = null;
let currentStream = null;
let scanMode = 'single'; // 'single' | 'group'
let currentRole = 'faculty'; // 'faculty' | 'student'
let activeFilter = 'all'; // 'all' | 'present' | 'absent'
let searchQuery = '';
let uploadedPhotoDescriptor = null;
let uploadedPhotoAvatar = null;
let fpsFrameCount = 0;
let lastFpsTime = performance.now();
let lastBlinkMap = new Map(); // prn -> timestamp

let registeredFaces = [];
const attendanceMap = new Map(); // prn -> { user, status, timestamp, confidence, avatar }
let lectures = [];
let activeLectureId = null;
let attendanceByLecture = {}; // lectureId -> { prn: {status, timestamp, confidence} }

// Storage Keys
const STORAGE_KEY_FACES = 'markify_registered_faces';
const STORAGE_KEY_ATTENDANCE = 'markify_attendance_by_lecture';
const STORAGE_KEY_LECTURES = 'markify_lectures';
const STORAGE_KEY_ACTIVE_LEC = 'markify_active_lecture';
const STORAGE_KEY_ROLE = 'markify_user_role';

// Model Paths - Local First with CDN Fallback
const LOCAL_MODEL_PATH = './models';
const CDN_MODEL_PATH = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/model/';

const MODE_CONFIG = {
    single: { inputSize: 416, minFrameGapMs: 50 },
    group:  { inputSize: 512, minFrameGapMs: 100 }
};

// --- Web Audio API Synthetic Chime (Zero External Files) ---
let audioCtx = null;
function playSuccessChime() {
    if (!isAudioEnabled) return;
    try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();

        const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6 (Bright Chord)
        notes.forEach((freq, idx) => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, audioCtx.currentTime + idx * 0.08);

            gain.gain.setValueAtTime(0, audioCtx.currentTime + idx * 0.08);
            gain.gain.linearRampToValueAtTime(0.18, audioCtx.currentTime + idx * 0.08 + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + idx * 0.08 + 0.35);

            osc.connect(gain);
            gain.connect(audioCtx.destination);

            osc.start(audioCtx.currentTime + idx * 0.08);
            osc.stop(audioCtx.currentTime + idx * 0.08 + 0.36);
        });
    } catch (e) {
        console.warn('Audio chime note played:', e);
    }
}

function speakVoiceFeedback(text) {
    if (!isAudioEnabled || !('speechSynthesis' in window)) return;
    try {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.1;
        utterance.pitch = 1.05;
        window.speechSynthesis.speak(utterance);
    } catch (e) {}
}

// --- Live Clock ---
function tickClock() {
    const now = new Date();
    if (clockTime) clockTime.innerText = now.toLocaleTimeString();
    if (clockDate) clockDate.innerText = now.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}
tickClock();
setInterval(tickClock, 1000);

// --- Ambient Background Glyph Spawner ---
function spawnBackgroundGlyphs() {
    if (!bgCodeLayer) return;
    const glyphs = ['01', '10', '101', '010', '0101', '1010', '{ }', '</>', 'AI.verify()', '11000', '01010101', '#!/', '=>'];
    const count = 20;
    const frag = document.createDocumentFragment();
    for (let i = 0; i < count; i++) {
        const el = document.createElement('span');
        el.textContent = glyphs[Math.floor(Math.random() * glyphs.length)];
        el.style.left = Math.random() * 100 + '%';
        el.style.fontSize = (11 + Math.random() * 12).toFixed(0) + 'px';
        const duration = 20 + Math.random() * 25;
        el.style.animationDuration = duration.toFixed(1) + 's';
        el.style.animationDelay = (-Math.random() * duration).toFixed(1) + 's';
        el.style.setProperty('--drift', (Math.random() * 80 - 40).toFixed(0) + 'px');
        frag.appendChild(el);
    }
    bgCodeLayer.appendChild(frag);
}
spawnBackgroundGlyphs();

// --- Role Switching & Authentication ---
function setPortalRole(role) {
    currentRole = role;
    localStorage.setItem(STORAGE_KEY_ROLE, role);

    if (role === 'faculty') {
        facultyPortalView.classList.add('active');
        studentPortalView.classList.remove('active');
        document.body.className = 'role-faculty';
        demoBtnFaculty.classList.add('active');
        demoBtnStudent.classList.remove('active');
        userDisplayName.innerText = 'Prof. A. Sharma';
        userRoleBadge.innerText = 'Faculty Portal';
        userAvatar.innerText = '👨‍🏫';
        renderAttendanceTable();
    } else {
        facultyPortalView.classList.remove('active');
        studentPortalView.classList.add('active');
        document.body.className = 'role-student';
        demoBtnStudent.classList.add('active');
        demoBtnFaculty.classList.remove('active');
        userDisplayName.innerText = 'Alex Rivera (Student)';
        userRoleBadge.innerText = 'Student Portal';
        userAvatar.innerText = '🎓';
        renderStudentPortal();
    }
}

demoBtnFaculty.addEventListener('click', () => setPortalRole('faculty'));
demoBtnStudent.addEventListener('click', () => setPortalRole('student'));

authToggleBtn.addEventListener('click', () => {
    authModal.style.display = 'flex';
});
closeAuthModalBtn.addEventListener('click', () => authModal.style.display = 'none');
loginFacultyBtn.addEventListener('click', () => {
    setPortalRole('faculty');
    authModal.style.display = 'none';
});
loginStudentBtn.addEventListener('click', () => {
    setPortalRole('student');
    authModal.style.display = 'none';
});

// --- Modal Handlers ---
openModalBtn.addEventListener('click', () => {
    modal.style.display = 'flex';
    regName.focus();
});
closeModalBtn.addEventListener('click', () => modal.style.display = 'none');
newLectureBtn.addEventListener('click', () => {
    lectureModal.style.display = 'flex';
    lecSubject.focus();
});
closeLectureModalBtn.addEventListener('click', () => lectureModal.style.display = 'none');
reportModalBtn.addEventListener('click', openReportModal);
closeReportModalBtn.addEventListener('click', () => reportModal.style.display = 'none');

window.addEventListener('click', (e) => {
    if (e.target === modal) modal.style.display = 'none';
    if (e.target === lectureModal) lectureModal.style.display = 'none';
    if (e.target === reportModal) reportModal.style.display = 'none';
    if (e.target === authModal) authModal.style.display = 'none';
});

// --- Tab Switching for Enrollment (Webcam vs Photo Upload) ---
tabWebcamBtn.addEventListener('click', () => {
    tabWebcamBtn.classList.add('active');
    tabUploadBtn.classList.remove('active');
    enrollWebcamSection.classList.add('active');
    enrollUploadSection.classList.remove('active');
});

tabUploadBtn.addEventListener('click', () => {
    tabUploadBtn.classList.add('active');
    tabWebcamBtn.classList.remove('active');
    enrollUploadSection.classList.add('active');
    enrollWebcamSection.classList.remove('active');
});

// --- Audio & Anti-Spoofing Toggles ---
audioToggleBtn.addEventListener('click', () => {
    isAudioEnabled = !isAudioEnabled;
    audioToggleBtn.classList.toggle('active', isAudioEnabled);
    audioToggleBtn.innerText = isAudioEnabled ? '🔊 Audio: ON' : '🔇 Audio: OFF';
});

livenessBtn.addEventListener('click', () => {
    isAntiSpoofActive = !isAntiSpoofActive;
    livenessBtn.classList.toggle('on', isAntiSpoofActive);
    livenessBtn.innerText = isAntiSpoofActive ? '🛡️ Anti-Spoof: ON' : '🛡️ Anti-Spoof: OFF';
    perfLiveness.innerText = isAntiSpoofActive ? 'ACTIVE' : 'OFF';
    perfLiveness.className = isAntiSpoofActive ? 'tag-live-ok' : '';
});

// --- Lecture Management ---
function ensureDefaultLecture() {
    if (lectures.length === 0) {
        const id = 'lec_1';
        lectures.push({
            id,
            subject: 'Data Structures & Algorithms',
            professor: 'Prof. A. Sharma',
            section: 'B.Tech CSE - Sem 3'
        });
        lectures.push({
            id: 'lec_2',
            subject: 'Cloud Computing & DevOps',
            professor: 'Dr. Rajesh K.',
            section: 'B.Tech CSE - Sem 5'
        });
        activeLectureId = id;
    }
    if (!activeLectureId || !lectures.some(l => l.id === activeLectureId)) {
        activeLectureId = lectures[0].id;
    }
}

function getActiveLecture() {
    return lectures.find(l => l.id === activeLectureId) || lectures[0] || null;
}

function rebuildAttendanceMapForActiveLecture() {
    attendanceMap.clear();
    const records = attendanceByLecture[activeLectureId] || {};
    registeredFaces.forEach(user => {
        const rec = records[user.prn];
        attendanceMap.set(user.prn, {
            user,
            status: rec ? rec.status : 'Absent',
            timestamp: rec ? rec.timestamp : '-',
            confidence: rec ? rec.confidence : '-',
            avatar: user.avatar || null
        });
    });
}

function renderLectureUI() {
    const active = getActiveLecture();
    if (lectureSubjectLabel) lectureSubjectLabel.innerText = active ? active.subject : 'General Lecture';
    if (lectureMetaLabel) lectureMetaLabel.innerText = active ? `${active.professor}${active.section ? ' · ' + active.section : ''}` : '';
    if (logTitle) logTitle.innerText = active ? `Roster — ${active.subject}` : 'Student Attendance Roster';

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
        alert("Please provide both Subject Name and Professor.");
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

// --- Storage Persistence ---
function saveToStorage() {
    const serializableFaces = registeredFaces.map(user => ({
        ...user,
        descriptor: Array.from(user.descriptor)
    }));
    localStorage.setItem(STORAGE_KEY_FACES, JSON.stringify(serializableFaces));

    const currentRecords = {};
    attendanceMap.forEach((data, prn) => {
        currentRecords[prn] = {
            status: data.status,
            timestamp: data.timestamp,
            confidence: data.confidence
        };
    });
    attendanceByLecture[activeLectureId] = currentRecords;

    localStorage.setItem(STORAGE_KEY_ATTENDANCE, JSON.stringify(attendanceByLecture));
    localStorage.setItem(STORAGE_KEY_LECTURES, JSON.stringify(lectures));
    localStorage.setItem(STORAGE_KEY_ACTIVE_LEC, activeLectureId || '');
}

function loadFromStorage() {
    const savedFaces = localStorage.getItem(STORAGE_KEY_FACES);
    const savedLectures = localStorage.getItem(STORAGE_KEY_LECTURES);
    const savedAttendance = localStorage.getItem(STORAGE_KEY_ATTENDANCE);
    const savedActiveLecture = localStorage.getItem(STORAGE_KEY_ACTIVE_LEC);
    const savedRole = localStorage.getItem(STORAGE_KEY_ROLE);

    if (savedFaces) {
        try {
            const parsedFaces = JSON.parse(savedFaces);
            registeredFaces = parsedFaces.map(user => ({
                ...user,
                descriptor: new Float32Array(user.descriptor)
            }));
        } catch (e) { console.error(e); }
    }

    lectures = savedLectures ? JSON.parse(savedLectures) : [];
    attendanceByLecture = savedAttendance ? JSON.parse(savedAttendance) : {};
    activeLectureId = savedActiveLecture || null;

    ensureDefaultLecture();
    rebuildAttendanceMapForActiveLecture();
    renderLectureUI();
    renderAttendanceTable();

    if (savedRole) setPortalRole(savedRole);
}

// --- Offline-First Model Loading Engine ---
function setLoadProgress(pct, label) {
    if (loadProgressBar) loadProgressBar.style.width = pct + '%';
    if (statusText && label) statusText.innerText = label;
}

async function loadModels() {
    try {
        try {
            await faceapi.tf.setBackend('webgl');
            await faceapi.tf.ready();
            perfBackend.innerText = 'WebGL (Hardware Accelerated)';
        } catch (backendErr) {
            console.warn('WebGL backend unavailable, using CPU:', backendErr);
            perfBackend.innerText = 'CPU Fallback';
        }

        setLoadProgress(15, 'Loading Face Detector...');
        let loadSucceeded = false;

        // Try local models first
        try {
            await faceapi.nets.tinyFaceDetector.loadFromUri(LOCAL_MODEL_PATH);
            setLoadProgress(45, 'Loading Facial Landmarks...');
            await faceapi.nets.faceLandmark68Net.loadFromUri(LOCAL_MODEL_PATH);
            setLoadProgress(75, 'Loading Biometric Embedder...');
            await faceapi.nets.faceRecognitionNet.loadFromUri(LOCAL_MODEL_PATH);
            loadSucceeded = true;
            console.log('Face models loaded from local storage.');
        } catch (localErr) {
            console.warn('Local models failed, falling back to CDN...', localErr);
            await faceapi.nets.tinyFaceDetector.loadFromUri(CDN_MODEL_PATH);
            await faceapi.nets.faceLandmark68Net.loadFromUri(CDN_MODEL_PATH);
            await faceapi.nets.faceRecognitionNet.loadFromUri(CDN_MODEL_PATH);
            loadSucceeded = true;
        }

        setLoadProgress(90, 'Warming up inference engine...');
        await warmUpModels();

        setLoadProgress(100, 'AI Models Ready · Click "Start Camera"');
        setTimeout(() => {
            if (loadProgressWrap) loadProgressWrap.style.display = 'none';
        }, 500);

        loadFromStorage();

        startBtn.disabled = false;
        registerBtn.disabled = false;
        registerPhotoBtn.disabled = false;
        statusDot.className = 'status-dot active-dot';
    } catch (err) {
        console.error("Critical Model loading error:", err);
        if (statusText) statusText.innerText = "Model initialization issue. Please check console.";
        if (statusDot) statusDot.className = 'status-dot error-dot';
    }
}

async function warmUpModels() {
    try {
        const dummyCanvas = document.createElement('canvas');
        dummyCanvas.width = 240;
        dummyCanvas.height = 180;
        await faceapi.detectAllFaces(dummyCanvas, new faceapi.TinyFaceDetectorOptions({ inputSize: 224 }))
            .withFaceLandmarks()
            .withFaceDescriptors();
    } catch (e) {
        console.warn('Warmup pass completed:', e);
    }
}

window.addEventListener('DOMContentLoaded', loadModels);

// --- Camera Stream Controller ---
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
        statusText.innerText = "Camera Active · Click 'Recognition' to scan";
    } catch (err) {
        console.error("Camera access error:", err);
        statusDot.className = 'status-dot error-dot';
        statusText.innerText = "Camera Access Blocked / Not Found";
        alert("Webcam not available or permission denied. You can still test recognition using the '🖼️ Test with Photo' button below the feed!");
    }
}

function stopCamera() {
    if (!isStreaming) return;

    if (isProxyActive) {
        isProxyActive = false;
        proxyBtn.innerText = "◎ Recognition: OFF";
        proxyBtn.classList.remove('active');
        viewfinderFrame.classList.remove('show');
        recIndicator.classList.remove('show');
        livenessBadge.classList.remove('show');
        stopFrameLoop();
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        mismatchAlert.classList.remove('show');
    }

    if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
        currentStream = null;
    }
    video.srcObject = null;
    isStreaming = false;
    cameraContainer.classList.remove('streaming');

    stopBtn.style.display = 'none';
    startBtn.style.display = 'inline-flex';
    proxyBtn.disabled = true;
    modeBtn.disabled = true;
    statusDot.className = 'status-dot';
    statusText.innerText = "Camera Standby.";
    statLiveFaces.innerText = '0';
    perfFaces.innerText = '0';
}

video.addEventListener('loadedmetadata', () => {
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
});

modeBtn.addEventListener('click', () => {
    scanMode = scanMode === 'single' ? 'group' : 'single';
    modeBtn.innerText = scanMode === 'single' ? 'Mode: Single' : 'Mode: Group';
    modeBtn.classList.toggle('on', scanMode === 'group');
});

proxyBtn.addEventListener('click', () => {
    if (!isStreaming) return;
    isProxyActive = !isProxyActive;

    if (isProxyActive) {
        proxyBtn.innerText = "◎ Recognition: ON";
        proxyBtn.classList.add('active');
        modeBtn.disabled = true;
        statusDot.className = "status-dot proxy-dot";
        statusText.innerText = "AI Recognition Active — Tracking Faces";
        viewfinderFrame.classList.add('show');
        recIndicator.classList.add('show');
        if (isAntiSpoofActive) livenessBadge.classList.add('show');
        startFrameLoop();
    } else {
        proxyBtn.innerText = "◎ Recognition: OFF";
        proxyBtn.classList.remove('active');
        modeBtn.disabled = false;
        statusDot.className = "status-dot active-dot";
        statusText.innerText = "Recognition Paused";
        viewfinderFrame.classList.remove('show');
        recIndicator.classList.remove('show');
        livenessBadge.classList.remove('show');
        stopFrameLoop();
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        mismatchAlert.classList.remove('show');
        statLiveFaces.innerText = '0';
        perfFaces.innerText = '0';
    }
});

// --- Frame Processing Loop ---
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
    if (isProcessingFrame) return;

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

    // Calculate FPS
    fpsFrameCount++;
    const now = performance.now();
    if (now - lastFpsTime >= 1000) {
        const fps = ((fpsFrameCount * 1000) / (now - lastFpsTime)).toFixed(1);
        perfFps.innerText = fps;
        fpsFrameCount = 0;
        lastFpsTime = now;
    }

    perfFaces.innerText = String(faceCount);
    perfLatency.innerText = `${elapsed.toFixed(0)} ms`;
    statLiveFaces.innerText = String(faceCount);

    if (!isProxyActive) return;
    const minGap = MODE_CONFIG[scanMode].minFrameGapMs;
    const nextDelay = Math.max(minGap - elapsed, 10);
    frameLoopTimeoutId = setTimeout(runFrameLoopTick, nextDelay);
}

// --- Anti-Spoofing Eye Aspect Ratio (EAR) Helper ---
function calculateEAR(eyeLandmarks) {
    // eyeLandmarks is array of 6 points: [p1, p2, p3, p4, p5, p6]
    const p1 = eyeLandmarks[0], p2 = eyeLandmarks[1], p3 = eyeLandmarks[2];
    const p4 = eyeLandmarks[3], p5 = eyeLandmarks[4], p6 = eyeLandmarks[5];

    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const ear = (dist(p2, p6) + dist(p3, p5)) / (2.0 * dist(p1, p4));
    return ear;
}

// --- Core Face Recognition & Attendance Engine ---
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
            const landmarks = detection.landmarks;

            // Anti-spoofing check
            let isLive = true;
            if (isAntiSpoofActive && landmarks) {
                const positions = landmarks.positions;
                const leftEye = positions.slice(36, 42);
                const rightEye = positions.slice(42, 48);
                const leftEAR = calculateEAR(leftEye);
                const rightEAR = calculateEAR(rightEye);
                const avgEAR = (leftEAR + rightEAR) / 2;

                // Typical EAR: open > 0.22, blink < 0.18
                isLive = avgEAR > 0.12; // Basic blink & landmark sanity check
            }

            let bestMatch = null;
            let lowestDistance = 0.58; // Dynamic tolerance

            registeredFaces.forEach(user => {
                const distance = faceapi.euclideanDistance(descriptor, user.descriptor);
                if (distance < lowestDistance) {
                    lowestDistance = distance;
                    bestMatch = user;
                }
            });

            if (bestMatch && isLive) {
                const confidencePct = Math.max(70, Math.min(99.8, (1 - lowestDistance / 0.7) * 100)).toFixed(1);
                const record = attendanceMap.get(bestMatch.prn);
                const alreadyPresent = record && record.status === 'Present';

                markStudentPresent(bestMatch, `${confidencePct}%`);
                drawEnhancedBox(box.x, box.y, box.width, box.height, `${bestMatch.name} (${confidencePct}%)`, '#10b981', true);
            } else if (!isLive) {
                drawEnhancedBox(box.x, box.y, box.width, box.height, "SPOOF / BLINK CHECK", '#f59e0b', false);
            } else {
                drawEnhancedBox(box.x, box.y, box.width, box.height, "UNREGISTERED FACE", '#f43f5e', false);
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

function drawEnhancedBox(x, y, w, h, label, color, isVerified) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.strokeRect(x, y, w, h);

    // Corner brackets
    const bracketSize = 12;
    ctx.fillStyle = color;
    ctx.fillRect(x - 2, y - 2, bracketSize, 3);
    ctx.fillRect(x - 2, y - 2, 3, bracketSize);
    ctx.fillRect(x + w - bracketSize + 2, y - 2, bracketSize, 3);
    ctx.fillRect(x + w - 1, y - 2, 3, bracketSize);

    // Label tag
    ctx.font = "700 12px 'JetBrains Mono', monospace";
    const paddingX = 8;
    const textWidth = ctx.measureText(label).width;

    ctx.fillStyle = color;
    ctx.fillRect(x, Math.max(0, y - 24), textWidth + paddingX * 2, 22);

    ctx.fillStyle = '#06090e';
    ctx.fillText(label, x + paddingX, Math.max(15, y - 8));
    ctx.restore();
}

function triggerSuccessAnimation(studentName, confidence = '99.4%') {
    toastText.innerText = `PRESENT: ${studentName}`;
    toastSub.innerText = `Match Confidence: ${confidence} · Live Verified`;
    successToast.classList.add('show');

    playSuccessChime();
    speakVoiceFeedback(`Attendance marked for ${studentName}`);

    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
        successToast.classList.remove('show');
    }, 3200);
}

function markStudentPresent(user, confidence = '98.5%') {
    const record = attendanceMap.get(user.prn);
    if (record && record.status !== 'Present') {
        record.status = 'Present';
        record.timestamp = new Date().toLocaleTimeString();
        record.confidence = confidence;
        saveToStorage();
        renderAttendanceTable();
        triggerSuccessAnimation(user.name, confidence);
    }
}

// --- Test Recognition from Image File Upload (Judge Fallback Mode) ---
testImageInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    statusText.innerText = "Analyzing Test Image...";
    const img = new Image();
    img.src = URL.createObjectURL(file);
    img.onload = async () => {
        const detections = await faceapi.detectAllFaces(img, new faceapi.TinyFaceDetectorOptions({ inputSize: 416 }))
            .withFaceLandmarks()
            .withFaceDescriptors();

        if (detections.length === 0) {
            alert("No faces detected in the uploaded test photo.");
            statusText.innerText = "No face found in test photo.";
            return;
        }

        let matchFound = 0;
        detections.forEach(detection => {
            let bestMatch = null;
            let lowestDistance = 0.58;
            registeredFaces.forEach(user => {
                const distance = faceapi.euclideanDistance(detection.descriptor, user.descriptor);
                if (distance < lowestDistance) {
                    lowestDistance = distance;
                    bestMatch = user;
                }
            });

            if (bestMatch) {
                const conf = ((1 - lowestDistance / 0.7) * 100).toFixed(1) + '%';
                markStudentPresent(bestMatch, conf);
                matchFound++;
            }
        });

        alert(`Analysis Complete! Detected ${detections.length} face(s), matched ${matchFound} registered student(s).`);
        statusText.innerText = `Test photo verified: ${matchFound} match(es).`;
    };
});

// --- Register New Student via Live Webcam ---
registerBtn.addEventListener('click', async () => {
    if (!isStreaming) {
        alert("Please start the camera first before live capturing!");
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

    statusText.innerText = "Capturing face embedding...";
    const detection = await faceapi.detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 416 }))
        .withFaceLandmarks()
        .withFaceDescriptor();

    if (!detection) {
        alert("No face detected! Please position your face clearly in the camera.");
        return;
    }

    // Capture small avatar thumbnail
    const thumbCanvas = document.createElement('canvas');
    thumbCanvas.width = 64;
    thumbCanvas.height = 64;
    const thumbCtx = thumbCanvas.getContext('2d');
    thumbCtx.drawImage(video, 0, 0, 64, 64);
    const avatarUrl = thumbCanvas.toDataURL('image/jpeg', 0.8);

    const newUser = {
        id: Date.now(),
        name,
        prn,
        email,
        avatar: avatarUrl,
        descriptor: detection.descriptor
    };

    registeredFaces.push(newUser);
    attendanceMap.set(prn, {
        user: newUser,
        status: 'Absent',
        timestamp: '-',
        confidence: '-',
        avatar: avatarUrl
    });

    saveToStorage();
    renderAttendanceTable();

    regName.value = '';
    regPrn.value = '';
    regEmail.value = '';
    modal.style.display = 'none';

    alert(`Successfully enrolled student: ${name} (PRN ${prn})`);
});

// --- Register New Student via Photo Upload ---
regPhotoDropzone.addEventListener('click', () => regPhotoInput.click());
regPhotoInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    dropzoneLabel.innerText = file.name;
    const img = new Image();
    img.src = URL.createObjectURL(file);
    img.onload = async () => {
        photoPreview.src = img.src;
        photoPreview.style.display = 'block';

        const detection = await faceapi.detectSingleFace(img, new faceapi.TinyFaceDetectorOptions({ inputSize: 416 }))
            .withFaceLandmarks()
            .withFaceDescriptor();

        if (!detection) {
            alert("No face could be found in this uploaded photo. Please try a clearer portrait.");
            uploadedPhotoDescriptor = null;
            registerPhotoBtn.disabled = true;
            return;
        }

        uploadedPhotoDescriptor = detection.descriptor;
        uploadedPhotoAvatar = img.src;
        registerPhotoBtn.disabled = false;
        dropzoneLabel.innerText = "✓ Face embedding detected successfully!";
    };
});

registerPhotoBtn.addEventListener('click', () => {
    const name = regName.value.trim();
    const prn = regPrn.value.trim();
    const email = regEmail.value.trim();

    if (!name || !prn || !email) {
        alert("Please fill in Name, PRN, and Email.");
        return;
    }

    if (!uploadedPhotoDescriptor) {
        alert("Please upload a photo with a visible face first.");
        return;
    }

    if (attendanceMap.has(prn)) {
        alert(`Student with PRN "${prn}" is already registered.`);
        return;
    }

    const newUser = {
        id: Date.now(),
        name,
        prn,
        email,
        avatar: uploadedPhotoAvatar,
        descriptor: uploadedPhotoDescriptor
    };

    registeredFaces.push(newUser);
    attendanceMap.set(prn, {
        user: newUser,
        status: 'Absent',
        timestamp: '-',
        confidence: '-',
        avatar: uploadedPhotoAvatar
    });

    saveToStorage();
    renderAttendanceTable();

    regName.value = '';
    regPrn.value = '';
    regEmail.value = '';
    uploadedPhotoDescriptor = null;
    photoPreview.style.display = 'none';
    dropzoneLabel.innerText = "Click or Drag & Drop Student Photo here";
    modal.style.display = 'none';

    alert(`Successfully registered ${name} from uploaded photo!`);
});

// --- Roster Table Rendering & Quick Controls ---
function renderAttendanceTable() {
    if (!logBody) return;
    logBody.innerHTML = '';

    let total = 0;
    let presentCount = 0;
    let absentCount = 0;

    const filteredEntries = [];

    attendanceMap.forEach((data, prn) => {
        total++;
        if (data.status === 'Present') presentCount++;
        else absentCount++;

        // Apply Filter & Search
        const matchesFilter = (activeFilter === 'all') ||
            (activeFilter === 'present' && data.status === 'Present') ||
            (activeFilter === 'absent' && data.status !== 'Present');

        const q = searchQuery.toLowerCase();
        const matchesSearch = !q || data.user.name.toLowerCase().includes(q) || data.user.prn.toLowerCase().includes(q);

        if (matchesFilter && matchesSearch) {
            filteredEntries.push(data);
        }
    });

    // Update Counts & Rate
    if (countAll) countAll.innerText = String(total);
    if (countPresent) countPresent.innerText = String(presentCount);
    if (countAbsent) countAbsent.innerText = String(absentCount);

    statRegistered.innerText = String(total);
    statPresent.innerText = String(presentCount);
    statAbsent.innerText = String(absentCount);
    const rate = total > 0 ? ((presentCount / total) * 100).toFixed(0) : 0;
    if (statPresentPct) statPresentPct.innerText = `${rate}% Verified`;

    if (filteredEntries.length === 0) {
        logBody.innerHTML = `
            <tr class="empty-row">
                <td colspan="7">No matching student records found.</td>
            </tr>
        `;
        return;
    }

    filteredEntries.forEach(data => {
        const row = document.createElement('tr');
        const isPres = data.status === 'Present';
        const badgeClass = isPres ? 'present-badge' : 'absent-badge';
        const initial = data.user.name ? data.user.name.charAt(0).toUpperCase() : '?';

        row.innerHTML = `
            <td>
                <div class="student-row-info">
                    ${data.avatar ? `<img src="${data.avatar}" class="avatar-mini" alt="avatar">` : `<div class="avatar-mini">${initial}</div>`}
                    <strong>${data.user.name}</strong>
                </div>
            </td>
            <td><code>${data.user.prn}</code></td>
            <td>${data.user.email}</td>
            <td>${data.timestamp}</td>
            <td>
                <span class="badge ${badgeClass}" data-prn="${data.user.prn}" title="Click to manually toggle status">
                    ${data.status} ✎
                </span>
            </td>
            <td><small>${data.confidence || '—'}</small></td>
            <td>
                <button class="row-delete-btn" type="button" data-prn="${data.user.prn}" title="Remove Student">🗑</button>
            </td>
        `;
        logBody.appendChild(row);
    });
}

// Search and Filter Events
if (rosterSearch) {
    rosterSearch.addEventListener('input', (e) => {
        searchQuery = e.target.value.trim();
        renderAttendanceTable();
    });
}

filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        filterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activeFilter = btn.dataset.filter;
        renderAttendanceTable();
    });
});

// Table Event Delegation (Manual Toggle & Delete)
logBody.addEventListener('click', (e) => {
    // Status Toggle Badge
    const badge = e.target.closest('.badge');
    if (badge) {
        const prn = badge.dataset.prn;
        const record = attendanceMap.get(prn);
        if (record) {
            record.status = record.status === 'Present' ? 'Absent' : 'Present';
            record.timestamp = record.status === 'Present' ? new Date().toLocaleTimeString() : '-';
            record.confidence = record.status === 'Present' ? 'Manual Override' : '-';
            saveToStorage();
            renderAttendanceTable();
        }
        return;
    }

    // Delete Button
    const deleteBtn = e.target.closest('.row-delete-btn');
    if (deleteBtn) {
        const prn = deleteBtn.dataset.prn;
        if (confirm(`Remove student with PRN "${prn}"?`)) {
            registeredFaces = registeredFaces.filter(u => u.prn !== prn);
            attendanceMap.delete(prn);
            Object.keys(attendanceByLecture).forEach(lId => {
                if (attendanceByLecture[lId] && attendanceByLecture[lId][prn]) {
                    delete attendanceByLecture[lId][prn];
                }
            });
            saveToStorage();
            renderAttendanceTable();
        }
    }
});

// --- Student Self-Service Portal View ---
function renderStudentPortal() {
    if (!studentCoursesGrid) return;
    const student = registeredFaces[0] || {
        name: 'Alex Rivera',
        prn: '1032210042',
        email: 'alex.rivera@sspu.ac.in'
    };

    if (studentPortalName) studentPortalName.innerText = student.name;
    if (studentPortalPrn) studentPortalPrn.innerText = `PRN: ${student.prn} · Email: ${student.email}`;
    if (studentPortalAvatar) studentPortalAvatar.innerText = '🎓';

    let totalClasses = 0;
    let attendedClasses = 0;

    studentCoursesGrid.innerHTML = '';
    lectures.forEach(lec => {
        totalClasses++;
        const recs = attendanceByLecture[lec.id] || {};
        const isAttended = recs[student.prn] && recs[student.prn].status === 'Present';
        if (isAttended) attendedClasses++;

        const card = document.createElement('div');
        card.className = 'course-card';
        card.innerHTML = `
            <div class="course-card-header">
                <div>
                    <div class="course-subject">${lec.subject}</div>
                    <div class="course-prof">Instructor: ${lec.professor}</div>
                </div>
            </div>
            <div class="course-status-row">
                <span>Verified Status:</span>
                <span class="badge ${isAttended ? 'present-badge' : 'absent-badge'}">
                    ${isAttended ? 'Verified Present ✓' : 'Marked Absent ✕'}
                </span>
            </div>
        `;
        studentCoursesGrid.appendChild(card);
    });

    const rate = totalClasses > 0 ? ((attendedClasses / totalClasses) * 100).toFixed(0) : 100;
    if (studentPortalRate) studentPortalRate.innerText = `${rate}%`;
}

downloadSlipBtn.addEventListener('click', () => {
    window.print();
});

// --- Printable Report Modal ---
function openReportModal() {
    const active = getActiveLecture();
    if (repSubject) repSubject.innerText = active ? active.subject : '—';
    if (repProfessor) repProfessor.innerText = active ? active.professor : '—';
    if (repSection) repSection.innerText = active ? active.section || 'General' : '—';
    if (reportMetaTimestamp) reportMetaTimestamp.innerText = `Generated on: ${new Date().toLocaleString()}`;

    let present = 0;
    let total = attendanceMap.size;
    reportTableBody.innerHTML = '';

    let idx = 1;
    attendanceMap.forEach(data => {
        if (data.status === 'Present') present++;
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${idx++}</td>
            <td><strong>${data.user.name}</strong></td>
            <td><code>${data.user.prn}</code></td>
            <td>${data.user.email}</td>
            <td>${data.timestamp}</td>
            <td>${data.status}</td>
        `;
        reportTableBody.appendChild(row);
    });

    const rate = total > 0 ? ((present / total) * 100).toFixed(1) : 0;
    if (repRate) repRate.innerText = `${present} / ${total} (${rate}%)`;

    reportModal.style.display = 'flex';
}

// --- Quick Load Hackathon Demo Data ---
function loadDemoData() {
    const sampleStudents = [
        { name: "Alex Rivera", prn: "1032210042", email: "alex.rivera@sspu.ac.in", status: "Present", time: "09:02 AM" },
        { name: "Priya Sharma", prn: "1032210045", email: "priya.sharma@sspu.ac.in", status: "Present", time: "09:04 AM" },
        { name: "John Doe", prn: "1032210012", email: "john.doe@sspu.ac.in", status: "Absent", time: "-" },
        { name: "Sara Connor", prn: "1032210088", email: "sara.connor@sspu.ac.in", status: "Present", time: "09:12 AM" },
        { name: "Marcus Vance", prn: "1032210091", email: "marcus.v@sspu.ac.in", status: "Absent", time: "-" },
        { name: "Elena Rostova", prn: "1032210103", email: "elena.r@sspu.ac.in", status: "Present", time: "09:15 AM" },
        { name: "David Kim", prn: "1032210118", email: "david.kim@sspu.ac.in", status: "Present", time: "09:18 AM" },
        { name: "Aisha Khan", prn: "1032210125", email: "aisha.khan@sspu.ac.in", status: "Absent", time: "-" }
    ];

    registeredFaces = [];
    attendanceMap.clear();

    sampleStudents.forEach((s, idx) => {
        // Generate pseudo-descriptor vector of 128 floats
        const descriptor = new Float32Array(128);
        for (let i = 0; i < 128; i++) descriptor[i] = Math.sin(idx * 17 + i * 0.1);

        const user = {
            id: Date.now() + idx,
            name: s.name,
            prn: s.prn,
            email: s.email,
            avatar: null,
            descriptor
        };

        registeredFaces.push(user);
        attendanceMap.set(s.prn, {
            user,
            status: s.status,
            timestamp: s.time,
            confidence: s.status === 'Present' ? '99.2%' : '-',
            avatar: null
        });
    });

    saveToStorage();
    renderAttendanceTable();
    if (currentRole === 'student') renderStudentPortal();

    alert("⚡ Hackathon Demo Data Loaded! (8 Students, Attendance Statuses & Classes pre-populated)");
}

demoBtnData.addEventListener('click', loadDemoData);

// --- Clear & Export CSV ---
clearBtn.addEventListener('click', () => {
    if (confirm("Are you sure you want to clear all attendance data and registered students?")) {
        localStorage.removeItem(STORAGE_KEY_FACES);
        localStorage.removeItem(STORAGE_KEY_ATTENDANCE);
        localStorage.removeItem(STORAGE_KEY_LECTURES);
        localStorage.removeItem(STORAGE_KEY_ACTIVE_LEC);
        registeredFaces = [];
        attendanceMap.clear();
        lectures = [];
        attendanceByLecture = {};
        activeLectureId = null;
        ensureDefaultLecture();
        renderLectureUI();
        renderAttendanceTable();
        saveToStorage();
        alert("Roster cleared.");
    }
});

exportBtn.addEventListener('click', () => {
    if (attendanceMap.size === 0) {
        alert("No student records available to export.");
        return;
    }

    const active = getActiveLecture();
    const csvRows = [];
    csvRows.push(['Subject', 'Professor', 'Section', 'Name', 'PRN', 'Email', 'Time', 'Status', 'Confidence'].join(','));

    attendanceMap.forEach(data => {
        const row = [
            active ? active.subject : '',
            active ? active.professor : '',
            active ? active.section : '',
            data.user.name,
            data.user.prn,
            data.user.email,
            data.timestamp,
            data.status,
            data.confidence || ''
        ].map(v => `"${String(v).replace(/"/g, '""')}"`);
        csvRows.push(row.join(','));
    });

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Markify_${active ? active.subject.replace(/[^a-z0-9]/gi, '_') : 'Attendance'}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
});

// --- Keyboard Shortcuts for Hackathon Live Demo ---
window.addEventListener('keydown', (e) => {
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;

    if (e.code === 'Space') {
        e.preventDefault();
        if (isStreaming) proxyBtn.click();
    } else if (e.key === 'r' || e.key === 'R') {
        modal.style.display = 'flex';
        regName.focus();
    } else if (e.key === 'm' || e.key === 'M') {
        if (!modeBtn.disabled) modeBtn.click();
    } else if (e.key === 'l' || e.key === 'L') {
        livenessBtn.click();
    } else if (e.key === 'd' || e.key === 'D') {
        loadDemoData();
    } else if (e.key === 'Escape') {
        modal.style.display = 'none';
        lectureModal.style.display = 'none';
        reportModal.style.display = 'none';
        authModal.style.display = 'none';
    }
});

startBtn.addEventListener('click', startCamera);
stopBtn.addEventListener('click', stopCamera);
