/* ============================================================
   Quiz Master - AI Proctoring engine
   Face detection (face-api.js) + phone detection (coco-ssd)
   ============================================================ */

const Proctor = {
  stream: null,
  video: null,
  overlay: null,
  faceModelReady: false,      // tiny detector loaded (enough to count/position faces)
  recognitionReady: false,    // landmark + recognition loaded (needed for identity descriptor)
  recognitionPromise: null,
  objectModel: null,          // coco-ssd (phone detection), loads in background
  objectPromise: null,
  running: false,
  faceLoop: null,
  phoneLoop: null,
  onEvent: null, // (type, details) => {}   proctoring event callback
  lastFaceBox: null,

  MODEL_URL: 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.13/model',

  /**
   * Load AI models with minimal blocking. Only the tiny face detector is
   * awaited (small + fast) so the camera preview and verification can begin
   * almost immediately; the heavier recognition and phone-detection models
   * finish downloading in the background and are picked up when ready.
   */
  async loadModels(onProgress = () => {}) {
    onProgress('Loading face detector…');
    await faceapi.nets.tinyFaceDetector.loadFromUri(this.MODEL_URL);
    this.faceModelReady = true;
    onProgress('Camera ready — position your face');

    // Identity models (needed only at the moment the exam starts)
    this.recognitionPromise = Promise.all([
      faceapi.nets.faceLandmark68Net.loadFromUri(this.MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(this.MODEL_URL),
    ]).then(() => { this.recognitionReady = true; })
      .catch((e) => console.warn('Face recognition models failed to load:', e));

    // Phone detector — monitoring starts using it the moment it finishes
    this.objectPromise = cocoSsd.load({ base: 'lite_mobilenet_v2' })
      .then((m) => { this.objectModel = m; })
      .catch((e) => console.warn('Phone detection model failed to load:', e));
  },

  /** Ensure the identity (descriptor) models are ready before verifying. */
  async ensureRecognition() {
    if (this.recognitionReady) return true;
    if (this.recognitionPromise) await this.recognitionPromise;
    return this.recognitionReady;
  },

  /** Request webcam and bind it to a <video>. */
  async startCamera(videoEl, overlayEl) {
    this.video = videoEl;
    this.overlay = overlayEl;
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
      audio: false,
    });
    videoEl.srcObject = this.stream;
    await new Promise((res) => (videoEl.onloadedmetadata = res));
    await videoEl.play();

    // Camera unplugged / permission revoked mid-exam
    this.stream.getVideoTracks().forEach((track) => {
      track.addEventListener('ended', () => this.emit('camera-disconnected', 'Video track ended'));
    });
    return this.stream;
  },

  /** Move the existing stream to another <video> (precheck -> exam screen). */
  rebind(videoEl, overlayEl) {
    this.video = videoEl;
    this.overlay = overlayEl;
    videoEl.srcObject = this.stream;
    videoEl.play().catch(() => {});
  },

  emit(type, details) {
    if (this.onEvent) this.onEvent(type, details);
  },

  /** Detect faces once; returns { count, box, descriptor? } */
  async detectFaces(withDescriptor = false) {
    if (!this.faceModelReady || !this.video || this.video.readyState < 2) return { count: -1 };
    const opts = new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 });
    if (withDescriptor) {
      const results = await faceapi.detectAllFaces(this.video, opts).withFaceLandmarks().withFaceDescriptors();
      return {
        count: results.length,
        box: results[0]?.detection.box || null,
        descriptor: results[0] ? Array.from(results[0].descriptor) : null,
      };
    }
    const results = await faceapi.detectAllFaces(this.video, opts);
    return { count: results.length, box: results[0]?.box || null };
  },

  /** Is the detected face centered inside the circular guide? */
  faceInCircle(box) {
    if (!box || !this.video) return false;
    const vw = this.video.videoWidth, vh = this.video.videoHeight;
    const cx = vw / 2, cy = vh / 2;
    const radius = Math.min(vw, vh) * 0.38;
    const fx = box.x + box.width / 2, fy = box.y + box.height / 2;
    return Math.hypot(fx - cx, fy - cy) < radius * 0.75;
  },

  /** Draw circular guide + face status ring on the overlay canvas. */
  drawGuide(status /* 'ok' | 'warn' | 'none' */) {
    const c = this.overlay;
    if (!c || !this.video) return;
    c.width = this.video.videoWidth || 640;
    c.height = this.video.videoHeight || 480;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.beginPath();
    ctx.arc(c.width / 2, c.height / 2, Math.min(c.width, c.height) * 0.38, 0, Math.PI * 2);
    ctx.lineWidth = 4;
    ctx.strokeStyle = status === 'ok' ? 'rgba(34,197,94,0.9)' : status === 'warn' ? 'rgba(245,158,11,0.95)' : 'rgba(239,68,68,0.95)';
    ctx.stroke();
  },

  /** Capture a JPEG snapshot of the current video frame (data URI). */
  snapshot() {
    const c = document.createElement('canvas');
    c.width = this.video.videoWidth;
    c.height = this.video.videoHeight;
    c.getContext('2d').drawImage(this.video, 0, 0);
    return c.toDataURL('image/jpeg', 0.7);
  },

  /** Start the continuous monitoring loops. */
  startMonitoring() {
    this.running = true;
    const throttles = {}; // per-type cooldown so we don't spam the server
    const throttled = (type, details, cooldownMs = 12000) => {
      const now = Date.now();
      if (throttles[type] && now - throttles[type] < cooldownMs) return;
      throttles[type] = now;
      this.emit(type, details);
    };

    // Face loop (~every 1.6s)
    this.faceLoop = setInterval(async () => {
      if (!this.running) return;
      if (!this.stream || !this.stream.active) return throttled('camera-disconnected', 'Stream inactive', 5000);
      try {
        const { count, box } = await this.detectFaces();
        if (count === -1) return;
        if (count === 0) {
          this.drawGuide('none');
          throttled('no-face', 'No face detected in frame');
        } else if (count > 1) {
          this.drawGuide('none');
          throttled('multiple-faces', `${count} faces detected`);
        } else if (!this.faceInCircle(box)) {
          this.drawGuide('warn');
          throttled('face-outside-circle', 'Face left the guide circle');
        } else {
          this.drawGuide('ok');
        }
        this.lastFaceBox = box;
      } catch (e) { /* detection hiccup - skip frame */ }
    }, 1600);

    // Phone detection loop (~every 2.5s). Runs even if the phone model is
    // still downloading — it activates automatically once objectModel is set.
    // A short cooldown means a visible phone reaches the auto-submit limit fast.
    this.phoneLoop = setInterval(async () => {
      if (!this.running || !this.objectModel || !this.video || this.video.readyState < 2) return;
      try {
        const preds = await this.objectModel.detect(this.video, 5);
        const phone = preds.find((p) => p.class === 'cell phone' && p.score > 0.5);
        if (phone) throttled('phone-detected', `Confidence ${(phone.score * 100).toFixed(0)}%`, 5000);
      } catch (e) { /* skip frame */ }
    }, 2500);
  },

  stop() {
    this.running = false;
    clearInterval(this.faceLoop);
    clearInterval(this.phoneLoop);
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
  },
};
