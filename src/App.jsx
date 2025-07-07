import { useState, useEffect, useRef, useCallback } from "react";
import "./App.css";
import logo from "/vivox.png";

function App() {
  const [screen, setScreen] = useState("home");
  const [showModal, setShowModal] = useState(false);
  const [useBackCamera, setUseBackCamera] = useState(true);
  const canvasRef = useRef(null);
  const [capturedImage, setCapturedImage] = useState(null);
  const [showOptions, setShowOptions] = useState(false);
  const [showQuestionForm, setShowQuestionForm] = useState(false);
  const [questionText, setQuestionText] = useState("");
  const [audioBlob, setAudioBlob] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState("");
  const [imageSource, setImageSource] = useState(""); // "camera" or "upload"
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [aiType, setAIType] = useState(""); // "caption" or "read"
  const [aiResult, setAIResult] = useState(""); // The text or caption

  const videoRef = useRef(null);
  const fileInputRef = useRef(null);

  const BASE_URL = import.meta.env.VITE_BACKEND_URL;

  const startCamera = useCallback(() => {
    if (videoRef.current?.srcObject) {
      const tracks = videoRef.current.srcObject.getTracks();
      tracks.forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }

    setTimeout(async () => {
      try {
        const constraints = {
          video: {
            facingMode: useBackCamera ? { ideal: "environment" } : "user",
          },
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error("Camera error:", err);
      }
    }, 300);
  }, [useBackCamera]);

  useEffect(() => {
    if (screen === "camera") {
      startCamera();
      speechSynthesis.cancel();
    }
  }, [screen, startCamera]);

  const handleStartClick = () => {
    setShowModal(true); // Show the popup first
  };

  const handleModalClose = () => {
    setShowModal(false); // Close modal
    setScreen("camera"); // Then show camera
  };

  const handleCapture = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const imageData = canvas.toDataURL("image/jpeg");
    setCapturedImage(imageData);
    setImageSource("camera");
    setShowOptions(true);
  };

  const mediaRecorderRef = useRef(null);
  let audioChunks = [];

  const toggleVoiceRecording = async () => {
    if (isRecording) {
      // ✅ SAFELY STOP if recorder exists
      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.stop();
        setIsRecording(false);
      } else {
        console.warn("No recorder to stop.");
      }
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        const recorder = new MediaRecorder(stream);
        audioChunks = [];

        recorder.ondataavailable = (event) => {
          audioChunks.push(event.data);
        };

        recorder.onstop = () => {
          const blob = new Blob(audioChunks, { type: "audio/webm" });
          setAudioBlob(blob);
          mediaRecorderRef.current = null; // Clean up
        };

        recorder.start();
        mediaRecorderRef.current = recorder;
        setIsRecording(true);
      } catch (err) {
        console.error("Error starting voice recorder:", err);
        alert("Microphone access failed or denied.");
      }
    }
  };

  const speakText = (text) => {
    if (speechSynthesis.speaking) {
      speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    utterance.onend = () => setIsSpeaking(false);
    speechSynthesis.speak(utterance);
    setIsSpeaking(true);
  };

  const sendToAI = async (actionType, imageBase64) => {
    if (!capturedImage) {
      setOutput("Please capture or select an image first.");
      speakText("Please capture or select an image first.");
      return;
    }
    setLoading(true);
    const endpointMap = {
      caption: "/api/caption/",
      read: "/api/ocr/",
      vqa: "/api/vqa/",
    };

    const endpoint = endpointMap[actionType];

    if (!endpoint) {
      console.error("Invalid action type:", actionType);
      return;
    }

    try {
      const blob = await (await fetch(imageBase64)).blob();
      const formData = new FormData();
      formData.append("file", blob, "image.jpg");

      const response = await fetch(`${BASE_URL}${endpoint}`, {
        method: "POST",
        body: formData,
      });

      const result = await response.json();
      console.log("AI response:", result);

      if (actionType === "read" && result.data?.extracted_text) {
        setAIType("read");
        setAIResult(result.data.extracted_text);
        speakText(result.data.extracted_text);
      } else if (actionType === "caption" && result.data?.caption) {
        setAIType("caption");
        setAIResult(result.data.caption);
        speakText(result.data.caption);
      } else if (actionType === "vqa" && result.answer) {
        alert("Answer: " + result.answer);
      }
    } catch (error) {
      console.error("Error sending image to AI:", error);
      alert("Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const sendQuestionToAI = async () => {
    setLoading(true);

    const formData = new FormData();

    // ✅ Convert base64 to Blob (mimic real file)
    const blob = await (await fetch(capturedImage)).blob();
    formData.append("file", blob, "image.jpg"); // Must be named "file"

    if (questionText) {
      formData.append("question", questionText); // Must be named "question"
    } else {
      alert("Please enter a question.");
      return;
    }

    try {
      const response = await fetch(`${BASE_URL}/api/vqa/`, {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      console.log("AI VQA Response:", data);

      if (data.data?.answer) {
        speakText(data.data.answer);
      } else {
        alert("No answer received.");
      }
    } catch (err) {
      console.error("Error sending VQA request:", err);
      alert("Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const callSpeakAPI = async (text) => {
    const response = await fetch(`${BASE_URL}/api/audio/audio/speak`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const blob = await response.blob();
    const audioUrl = URL.createObjectURL(blob);
    new Audio(audioUrl).play();
  };

  const callTranscribeAPI = async () => {
    const formData = new FormData();
    formData.append("audio", audioBlob, "voice.webm");

    const response = await fetch(`${BASE_URL}/api/audio/audio/transcribe`, {
      method: "POST",
      body: formData,
    });

    const data = await response.json();
    console.log("Transcription:", data.text);
  };

  const handleRetake = () => {
    setCapturedImage(null);
    setShowOptions(false);
    setShowQuestionForm(false);
    setQuestionText("");
    setAudioBlob(null);
    startCamera();
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFileName(file.name);
      const reader = new FileReader();
      reader.onloadend = () => {
        setCapturedImage(reader.result); // Set the preview
        setShowOptions(true); // Show AI interaction buttons
        setImageSource("upload");
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <>
      <div className="flex flex-row h-16 pt-4 px-4 bg-white">
        <img src={logo} alt="" className="w-20 h-20 -mt-3 -mr-4" />
        <h1 className="text-2xl font-bold mb-2">VisoVox</h1>
      </div>
      {screen === "home" && (
        <div className="flex flex-col items-center justify-center text-center min-h-screen -mt-20">
          <p className="text-lg font-semibold mb-6">Welcome to VisoVox AI</p>
          <button
            className="bg-sky-500 text-white rounded-lg px-6 py-2 text-base font-bold mt-2 mb-4"
            onClick={handleStartClick}
          >
            START
          </button>
        </div>
      )}

      {showModal && (
        <div className="absolute inset-0 bg-opacity-40 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-xl shadow-lg max-w-md text-center">
            <p className="w-full max-w-xs mx-auto p-3 mb-4 text-center text-sm text-gray-700">
              To begin, capture an image by tapping the camera icon or upload an
              image using the image icon. Once your image is ready, you can
              proceed to edit or analyze it using the tools provided in the app.
              Enjoy exploring the features!
            </p>
            <button
              className="bg-sky-500 text-white px-4 py-2 rounded-lg font-semibold mt-2"
              onClick={handleModalClose}
            >
              Got it!
            </button>
          </div>
        </div>
      )}

      {screen === "camera" && !capturedImage && (
        <div className="flex flex-col items-center">
          <p className="text-lg font-bold my-4">Camera Mode</p>
          <video
            ref={videoRef}
            autoPlay
            className="w-full max-w-sm rounded-lg shadow mb-4"
          ></video>
          <canvas ref={canvasRef} style={{ display: "none" }} />
          <div className="flex flex-row justify-center items-center gap-6 mb-4">
            <button
              className="bg-white border border-gray-400 rounded-full w-12 h-12 flex items-center justify-center text-2xl"
              onClick={() => {
                setUseBackCamera((prev) => !prev);
                setTimeout(() => startCamera(), 300); // restart stream
              }}
              aria-label="Switch camera"
            >
              🔄
            </button>
            <button
              className="bg-sky-500 text-white rounded-full w-16 h-16 flex items-center justify-center text-3xl border-4 border-white shadow-lg"
              aria-label="Capture image from camera"
              onClick={handleCapture}
            >
              📸
            </button>
            <button
              className="bg-white border border-gray-400 rounded-full w-12 h-12 flex items-center justify-center text-2xl"
              aria-label="Upload from gallery"
              onClick={() => fileInputRef.current.click()}
            >
              🖼️
            </button>
            <input
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              ref={fileInputRef}
              onChange={handleImageUpload}
            />
          </div>
        </div>
      )}

      {!aiResult && showOptions && (
        <div className="mt-6 flex flex-col text-center items-center justify-center">
          <img
            src={capturedImage}
            alt="Captured"
            className="w-full max-w-sm rounded-lg shadow mb-4"
          />
          <button
            className="bg-gray-600 text-white px-4 py-2 rounded-lg mb-2"
            onClick={handleRetake}
          >
            {imageSource === "upload" ? "📤 Re-upload" : "🔄 Retake"}
          </button>

          {showOptions && (
            <div className="space-y-4">
              <button
                className="bg-sky-600 text-white mr-3 px-4 py-2 rounded-lg"
                onClick={() => sendToAI("read", capturedImage)}
              >
                🔊 Read
              </button>
              <button
                className="bg-violet-600 text-white me-3 px-4 py-2 rounded-lg"
                onClick={() => setShowQuestionForm(true)}
              >
                ❓ Ask
              </button>
              <button
                className="bg-rose-600 text-white me-3 px-4 py-2 rounded-lg"
                onClick={() => sendToAI("caption", capturedImage)}
              >
                📝Caption
              </button>
            </div>
          )}

          {showQuestionForm && (
            <div className="mt-6 text-center space-y-4">
              <textarea
                className="w-full max-w-sm p-2 border rounded"
                rows="3"
                placeholder="Type your question here..."
                value={questionText}
                onChange={(e) => setQuestionText(e.target.value)}
              />
              <button
                className="bg-sky-700 text-white px-4 py-2 rounded"
                onClick={sendQuestionToAI}
              >
                📤 Send Question
              </button>

              <div>
                <button
                  className={`px-4 py-2 rounded text-white ${
                    isRecording ? "bg-red-500" : "bg-green-600"
                  }`}
                  onClick={toggleVoiceRecording}
                >
                  {isRecording ? "Stop Recording" : "Record Voice"}
                </button>
              </div>
              {audioBlob && (
                <div className="mt-4">
                  <audio controls src={URL.createObjectURL(audioBlob)} />
                  <p className="text-sm text-gray-600 mt-1">
                    Recorded audio ready
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {loading && (
        <div className="flex flex-col items-center justify-center mt-6">
          <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-sky-500 border-solid"></div>
          <p className="text-gray-600 text-sm mt-2">Processing...</p>
        </div>
      )}

      {aiResult && (
        <div className="flex flex-col justify-center mt-4 p-4 bg-gray-100 rounded shadow w-full max-w-sm text-center">
          <h2 className="text-lg font-semibold mb-2 capitalize">
            {aiType === "caption" ? "📝 Caption Result" : "🔊 Read Text Result"}
          </h2>
          <p className="text-gray-800 mb-3">{aiResult}</p>
          <button
            className="bg-sky-600 text-white px-4 py-2 rounded"
            onClick={() => {
              speechSynthesis.cancel();
              speakText(aiResult);
            }}
          >
            🔁 {playing ? "Stop Audio" : "Replay"}
          </button>
        </div>
      )}
    </>
  );
}

export default App;
