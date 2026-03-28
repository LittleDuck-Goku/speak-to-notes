/**
 * Speech Recognition Module
 * Wraps the Web Speech API for voice-to-text with German language support.
 */

export class SpeechRecognizer {
  constructor({ lang = 'de-DE', onResult, onInterim, onEnd, onError } = {}) {
    this.lang = lang;
    this.onResult = onResult || (() => {});
    this.onInterim = onInterim || (() => {});
    this.onEnd = onEnd || (() => {});
    this.onError = onError || (() => {});
    this.isRecording = false;
    this.recognition = null;

    this._init();
  }

  _init() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      this.supported = false;
      return;
    }

    this.supported = true;
    this.recognition = new SpeechRecognition();
    this.recognition.lang = this.lang;
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.maxAlternatives = 1;

    this.recognition.onresult = (event) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }

      if (finalTranscript) {
        this.onResult(finalTranscript);
      }
      if (interimTranscript) {
        this.onInterim(interimTranscript);
      }
    };

    this.recognition.onerror = (event) => {
      this.isRecording = false;
      this.onError(event.error);
    };

    this.recognition.onend = () => {
      this.isRecording = false;
      this.onEnd();
    };
  }

  start() {
    if (!this.supported) {
      this.onError('not-supported');
      return false;
    }

    try {
      this.recognition.start();
      this.isRecording = true;
      return true;
    } catch (e) {
      this.onError(e.message);
      return false;
    }
  }

  stop() {
    if (this.recognition && this.isRecording) {
      this.recognition.stop();
      this.isRecording = false;
    }
  }

  toggle() {
    if (this.isRecording) {
      this.stop();
      return false;
    } else {
      return this.start();
    }
  }
}
