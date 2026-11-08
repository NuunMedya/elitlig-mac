// Yayın Stüdyosu — yayın sesinin örnekleri (AudioWorklet; ses iş parçacığında çalışır).
//
// Neden: ses ana iş parçacığında (MediaStreamTrackProcessor, 10 ms'lik blok başına bir görev)
// okunuyordu; arayüz yoğunken (gol akışı) saniyelerce ses bloğu okunamıyor / atılıyor, ffmpeg
// sesi beklediği için TÜM yayın çıkışı duruyordu. Bu işlemci örnekleri ses iş parçacığında
// toplar ve doğrudan kodlama işçisine (audioEncode.worker.js) MessagePort ile yollar: ana iş
// parçacığı hiç araya girmez. Kendi kendine yeten dosya (Vite olduğu gibi kopyalar).
class ElitligAudioTap extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const o = (options && options.processorOptions) || {};
    this.blockFrames = Math.max(128, Math.floor(o.blockFrames || 960));
    this.channels = Math.max(1, Math.min(2, o.channels || 2));
    this.out = null;
    this.planes = null;
    this.fill = 0;
    this.startFrame = 0;
    this.stopped = false;
    this.port.onmessage = (e) => {
      if (e.data && e.data.port) this.out = e.data.port;
      if (e.data && e.data.stop) this.stopped = true;
    };
  }

  process(inputs) {
    if (this.stopped) return false;
    const input = inputs[0];
    const n = input && input[0] ? input[0].length : 128;
    if (!this.out) return true;
    if (!this.planes) this.reset(currentFrame);
    for (let i = 0; i < n; i += 1) {
      if (this.fill === 0) this.startFrame = currentFrame + i;
      for (let c = 0; c < this.channels; c += 1) {
        const src = input && input.length ? input[Math.min(c, input.length - 1)] : null;
        this.planes[c][this.fill] = src ? src[i] : 0;
      }
      this.fill += 1;
      if (this.fill === this.blockFrames) {
        const planes = this.planes;
        this.out.postMessage({ frame: this.startFrame, frames: this.blockFrames, planes }, planes.map((p) => p.buffer));
        this.reset(currentFrame + i + 1);
      }
    }
    return true;
  }

  reset(frame) {
    this.planes = Array.from({ length: this.channels }, () => new Float32Array(this.blockFrames));
    this.fill = 0;
    this.startFrame = frame;
  }
}

registerProcessor("elitlig-audio-tap", ElitligAudioTap);
