/**
 * FocusFlow Pomodoro Timer Application Logic
 * Integrates precision timer, circular SVG progress ring, tab title sync,
 * session counter, dynamic theme switching, and ambient audio engine.
 */

document.addEventListener('DOMContentLoaded', () => {
  // -------------------------------------------------------------------------
  // DOM Elements
  // -------------------------------------------------------------------------
  const body = document.body;
  const timeDisplay = document.getElementById('timeDisplay');
  const timerSubStatus = document.getElementById('timerSubStatus');
  const progressRingCircle = document.getElementById('progressRingCircle');
  const timerCenterContent = document.querySelector('.timer-center-content');
  const modeBadge = document.getElementById('modeBadge');
  const modeText = document.getElementById('modeText');

  // Controls
  const startBtn = document.getElementById('startBtn');
  const pauseBtn = document.getElementById('pauseBtn');
  const resetBtn = document.getElementById('resetBtn');

  // Mode Tabs
  const switchFocusBtn = document.getElementById('switchFocusBtn');
  const switchBreakBtn = document.getElementById('switchBreakBtn');

  // Session Counter
  const sessionCountEl = document.getElementById('sessionCount');
  const resetSessionBtn = document.getElementById('resetSessionBtn');

  // Soundscape
  const soundWavesBtn = document.getElementById('soundWavesBtn');
  const soundRainBtn = document.getElementById('soundRainBtn');
  const soundBirdsBtn = document.getElementById('soundBirdsBtn');
  const soundButtons = [soundWavesBtn, soundRainBtn, soundBirdsBtn];
  const soundStatusBadge = document.getElementById('soundStatusBadge');
  const volumeSlider = document.getElementById('volumeSlider');
  const volumeValue = document.getElementById('volumeValue');
  const muteBtn = document.getElementById('muteBtn');
  const muteIcon = document.getElementById('muteIcon');
  const testAlarmBtn = document.getElementById('testAlarmBtn');

  // Extras
  const fastTestModeToggle = document.getElementById('fastTestModeToggle');
  const toastNotification = document.getElementById('toastNotification');

  // -------------------------------------------------------------------------
  // Timer State Configuration
  // -------------------------------------------------------------------------
  const CONFIG = {
    FOCUS_MINUTES: 25,
    BREAK_MINUTES: 5,
    FAST_FOCUS_SECONDS: 25,
    FAST_BREAK_SECONDS: 5
  };

  let isFastMode = false;
  let currentMode = 'focus'; // 'focus' | 'break'
  let timerState = 'stopped'; // 'stopped' | 'running' | 'paused'

  let totalDuration = CONFIG.FOCUS_MINUTES * 60; // in seconds
  let remainingSeconds = totalDuration;

  // Drift-prevention timing variables
  let timerIntervalId = null;
  let expectedEndTime = null;

  // SVG Progress Ring Geometry
  const RADIUS = 136;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

  // Initialize SVG Ring stroke
  progressRingCircle.style.strokeDasharray = `${CIRCUMFERENCE} ${CIRCUMFERENCE}`;
  progressRingCircle.style.strokeDashoffset = '0';

  // Session Storage
  const STORAGE_KEY = 'focusflow_completed_sessions';
  let completedSessions = parseInt(localStorage.getItem(STORAGE_KEY) || '0', 10);
  updateSessionDisplay();

  // -------------------------------------------------------------------------
  // Core Timer Functions
  // -------------------------------------------------------------------------

  /**
   * Returns default duration in seconds based on current mode & test mode
   */
  function getDefaultDuration(mode) {
    if (isFastMode) {
      return mode === 'focus' ? CONFIG.FAST_FOCUS_SECONDS : CONFIG.FAST_BREAK_SECONDS;
    }
    return mode === 'focus' ? CONFIG.FOCUS_MINUTES * 60 : CONFIG.BREAK_MINUTES * 60;
  }

  /**
   * Formats seconds into MM:SS
   */
  function formatTime(seconds) {
    const s = Math.max(0, Math.ceil(seconds));
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  /**
   * Updates SVG Ring Progress and Time Display
   */
  function renderTimer() {
    const timeStr = formatTime(remainingSeconds);
    timeDisplay.textContent = timeStr;

    // Calculate ring offset: full when 100% time left, shrinks as time passes
    const progress = Math.max(0, Math.min(1, remainingSeconds / totalDuration));
    const offset = CIRCUMFERENCE * (1 - progress);
    progressRingCircle.style.strokeDashoffset = offset;

    // Update Browser Tab Title
    const modeEmoji = currentMode === 'focus' ? '🎯' : '☕';
    const modeName = currentMode === 'focus' ? '집중 중' : '휴식 중';

    if (timerState === 'running') {
      document.title = `(${timeStr}) ${modeEmoji} ${modeName} | FocusFlow`;
    } else if (timerState === 'paused') {
      document.title = `(${timeStr} 일시정지) ${modeEmoji} | FocusFlow`;
    } else {
      document.title = 'FocusFlow | 포모도로 스마트 타이머';
    }
  }

  /**
   * Starts or resumes the timer
   */
  function startTimer() {
    if (timerState === 'running') return;

    // Ensure audio context is ready on user interaction
    if (window.soundEngine) {
      window.soundEngine.init();
    }

    timerState = 'running';
    expectedEndTime = Date.now() + remainingSeconds * 1000;

    startBtn.disabled = true;
    pauseBtn.disabled = false;
    timerSubStatus.textContent = currentMode === 'focus' ? '몰입 중...' : '편안히 휴식 중...';
    timerCenterContent.classList.add('running');

    clearInterval(timerIntervalId);
    timerIntervalId = setInterval(tick, 200);

    renderTimer();
  }

  /**
   * Timer Tick (Runs every 200ms with timestamp diffing for absolute accuracy)
   */
  function tick() {
    const now = Date.now();
    const diff = (expectedEndTime - now) / 1000;

    if (diff <= 0) {
      remainingSeconds = 0;
      renderTimer();
      handleSessionComplete();
    } else {
      remainingSeconds = diff;
      renderTimer();
    }
  }

  /**
   * Pauses the timer
   */
  function pauseTimer() {
    if (timerState !== 'running') return;

    timerState = 'paused';
    clearInterval(timerIntervalId);

    startBtn.disabled = false;
    pauseBtn.disabled = true;
    timerSubStatus.textContent = '일시 정지됨';
    timerCenterContent.classList.remove('running');

    renderTimer();
  }

  /**
   * Resets the timer to the beginning of the current mode
   */
  function resetTimer() {
    clearInterval(timerIntervalId);
    timerState = 'stopped';

    totalDuration = getDefaultDuration(currentMode);
    remainingSeconds = totalDuration;

    startBtn.disabled = false;
    pauseBtn.disabled = true;
    timerSubStatus.textContent = '준비 완료';
    timerCenterContent.classList.remove('running');

    renderTimer();
    showToast('타이머가 초기화되었습니다.');
  }

  /**
   * Automatically handles when session finishes (25m Focus -> 5m Break, or 5m Break -> 25m Focus)
   */
  function handleSessionComplete() {
    clearInterval(timerIntervalId);
    timerCenterContent.classList.remove('running');

    if (currentMode === 'focus') {
      // Completed Focus Session!
      completedSessions++;
      localStorage.setItem(STORAGE_KEY, completedSessions.toString());
      updateSessionDisplay();

      // Play celestial bowl alarm
      if (window.soundEngine) {
        window.soundEngine.playAlarm('focus');
      }

      showToast('🎉 집중 세션 완료! 5분 휴식을 시작합니다.');

      // Auto switch to Break mode and start
      switchMode('break', true);
    } else {
      // Completed Break Session!
      if (window.soundEngine) {
        window.soundEngine.playAlarm('break');
      }

      showToast('⚡ 충전 완료! 다시 25분 집중 세션을 시작합니다.');

      // Auto switch to Focus mode and start
      switchMode('focus', true);
    }
  }

  /**
   * Switches mode between 'focus' and 'break'
   * @param {'focus'|'break'} newMode
   * @param {boolean} autoStart - Whether to start running immediately
   */
  function switchMode(newMode, autoStart = false) {
    if (timerIntervalId) clearInterval(timerIntervalId);

    currentMode = newMode;
    totalDuration = getDefaultDuration(currentMode);
    remainingSeconds = totalDuration;

    // Update Theme on body
    if (currentMode === 'focus') {
      body.classList.remove('break-theme');
      body.classList.add('focus-theme');
      modeBadge.classList.remove('break');
      modeText.textContent = '🎯 집중 시간';
      switchFocusBtn.classList.add('active');
      switchBreakBtn.classList.remove('active');
    } else {
      body.classList.remove('focus-theme');
      body.classList.add('break-theme');
      modeBadge.classList.add('break');
      modeText.textContent = '☕ 편안한 휴식';
      switchBreakBtn.classList.add('active');
      switchFocusBtn.classList.remove('active');
    }

    if (autoStart) {
      timerState = 'running';
      expectedEndTime = Date.now() + remainingSeconds * 1000;
      startBtn.disabled = true;
      pauseBtn.disabled = false;
      timerSubStatus.textContent = currentMode === 'focus' ? '몰입 중...' : '편안히 휴식 중...';
      timerCenterContent.classList.add('running');
      timerIntervalId = setInterval(tick, 200);
    } else {
      timerState = 'stopped';
      startBtn.disabled = false;
      pauseBtn.disabled = true;
      timerSubStatus.textContent = '준비 완료';
      timerCenterContent.classList.remove('running');
    }

    renderTimer();
  }

  /**
   * Updates session counter DOM element
   */
  function updateSessionDisplay() {
    sessionCountEl.textContent = completedSessions;
  }

  // -------------------------------------------------------------------------
  // Soundscape & Ambient Audio Handlers
  // -------------------------------------------------------------------------

  /**
   * Handles click on ambient sound buttons
   */
  async function handleSoundSelect(soundType, clickedBtn) {
    if (!window.soundEngine) return;

    const activeSound = await window.soundEngine.playAmbient(soundType);

    soundButtons.forEach(btn => btn.classList.remove('active'));

    if (activeSound) {
      clickedBtn.classList.add('active');
      const soundNames = { waves: '파도 소리', rain: '빗소리', birds: '새소리' };
      soundStatusBadge.textContent = `${soundNames[activeSound]} 재생 중`;
      soundStatusBadge.classList.add('active');
      showToast(`🎧 ${soundNames[activeSound]} 재생 시작`);
    } else {
      soundStatusBadge.textContent = '선택 안 함';
      soundStatusBadge.classList.remove('active');
      showToast('사운드 정지');
    }
  }

  // Sound Buttons Listeners
  soundWavesBtn.addEventListener('click', () => handleSoundSelect('waves', soundWavesBtn));
  soundRainBtn.addEventListener('click', () => handleSoundSelect('rain', soundRainBtn));
  soundBirdsBtn.addEventListener('click', () => handleSoundSelect('birds', soundBirdsBtn));

  // Volume Slider
  volumeSlider.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    volumeValue.textContent = `${Math.round(val)}%`;
    if (window.soundEngine) {
      window.soundEngine.setVolume(val / 100);
    }
    if (val > 0 && muteBtn.classList.contains('muted')) {
      muteBtn.classList.remove('muted');
      muteIcon.textContent = '🔊';
    }
  });

  // Mute Toggle Button
  muteBtn.addEventListener('click', () => {
    if (!window.soundEngine) return;
    const isMuted = window.soundEngine.toggleMute();
    if (isMuted) {
      muteBtn.classList.add('muted');
      muteIcon.textContent = '🔇';
      showToast('음소거 됨');
    } else {
      muteBtn.classList.remove('muted');
      muteIcon.textContent = '🔊';
      showToast('음소거 해제');
    }
  });

  // Test Alarm Sound Button
  testAlarmBtn.addEventListener('click', () => {
    if (window.soundEngine) {
      window.soundEngine.playAlarm(currentMode);
      showToast(`🔔 ${currentMode === 'focus' ? '집중 종료 알림음' : '휴식 종료 알림음'} 재생`);
    }
  });

  // -------------------------------------------------------------------------
  // Control Buttons & Tab Listeners
  // -------------------------------------------------------------------------
  startBtn.addEventListener('click', startTimer);
  pauseBtn.addEventListener('click', pauseTimer);
  resetBtn.addEventListener('click', resetTimer);

  switchFocusBtn.addEventListener('click', () => {
    if (currentMode !== 'focus') switchMode('focus', false);
  });

  switchBreakBtn.addEventListener('click', () => {
    if (currentMode !== 'break') switchMode('break', false);
  });

  // Session Reset Button
  resetSessionBtn.addEventListener('click', () => {
    if (confirm('오늘의 완료 세션 기록을 0으로 초기화할까요?')) {
      completedSessions = 0;
      localStorage.setItem(STORAGE_KEY, '0');
      updateSessionDisplay();
      showToast('세션 카운터가 초기화되었습니다.');
    }
  });

  // Fast Test Mode Toggle
  fastTestModeToggle.addEventListener('change', (e) => {
    isFastMode = e.target.checked;
    resetTimer();
    showToast(isFastMode ? '⚡ 빠른 시연 모드 활성화 (25초/5초)' : '표준 포모도로 모드 (25분/5분)');
  });

  // -------------------------------------------------------------------------
  // Keyboard Shortcuts
  // -------------------------------------------------------------------------
  document.addEventListener('keydown', (e) => {
    // Ignore when focus is on inputs
    if (['INPUT', 'BUTTON', 'TEXTAREA'].includes(document.activeElement.tagName)) {
      if (e.code === 'Space') {
        // Prevent default button activation if space pressed
        e.preventDefault();
      }
    }

    if (e.code === 'Space') {
      e.preventDefault();
      if (timerState === 'running') {
        pauseTimer();
      } else {
        startTimer();
      }
    } else if (e.code === 'KeyR') {
      resetTimer();
    } else if (e.code === 'KeyM') {
      muteBtn.click();
    }
  });

  // -------------------------------------------------------------------------
  // Toast Notification Helper
  // -------------------------------------------------------------------------
  let toastTimeout = null;
  function showToast(message) {
    if (!toastNotification) return;
    toastNotification.textContent = message;
    toastNotification.classList.add('show');

    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      toastNotification.classList.remove('show');
    }, 2400);
  }

  // -------------------------------------------------------------------------
  // Initial Render
  // -------------------------------------------------------------------------
  renderTimer();
});
