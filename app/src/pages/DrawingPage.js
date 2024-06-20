import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { storage, db, auth } from "../firebase/firebase";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { collection, addDoc, doc } from "firebase/firestore";
import penImage from "../assets/pen.png";
import eraserImage from "../assets/eraser.png";
import "./DrawingPage.css";

function DrawingPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const canvasReference = useRef(null);
  const contextReference = useRef(null);
  const [isPressed, setIsPressed] = useState(false);
  const [lastColor, setLastColor] = useState("black");
  const [mode, setMode] = useState("pencil");
  const [showTextInput, setShowTextInput] = useState(false);
  const [inputText, setInputText] = useState("");
  const { selectedScene, imageUrl } = location.state || {};

  const uploadDrawing = async () => {
    const canvas = canvasReference.current;
    const base64Image = canvas.toDataURL("image/png");

    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/png")
    );
    if (!blob) return;

    // Upload the original image to Firebase Storage
    let originalUrl = "";
    const uploadImage = async (path, imageBlob) => {
      const storageRef = ref(storage, path);
      const snapshot = await uploadBytes(storageRef, imageBlob);
      return getDownloadURL(snapshot.ref);
    };

    originalUrl = await uploadImage(`drawing/original-${Date.now()}.png`, blob);

    // Send the base64 image to Baseten
    const sendToBaseten = async (base64Img) => {
      const url = "/model_versions/q48rmd3/predict"; // Replace with your Baseten endpoint
      const headers = {
        Authorization: "Api-Key 13235osK.AVglR2jVhzMHR1txMuFJCD49TEmV6FXY",
        "Content-Type": "application/json",
      };

      const imageData = base64Img.split(",")[1];
      const data = {
        prompt: "a plushy dog",
        images_data: imageData,
        guidance_scale: 8,
        lcm_steps: 50,
        seed: 2159232,
        num_inference_steps: 4,
        strength: 0.7,
        width: 512,
        height: 512,
      };

      try {
        const response = await fetch(url, {
          method: "POST",
          headers: headers,
          body: JSON.stringify(data),
        });

        if (response.ok) {
          const jsonResponse = await response.json();
          return `data:image/png;base64,${jsonResponse.model_output.image}`;
        } else {
          console.error("Server returned an error", response.statusText);
          return null;
        }
      } catch (error) {
        console.error("Error sending image to server:", error);
        return null;
      }
    };

    const enhancedBase64 = await sendToBaseten(base64Image);
    if (!enhancedBase64) return;

    // Convert the enhanced base64 image to a Blob
    const enhancedBlob = await fetch(enhancedBase64)
      .then((res) => res.blob())
      .catch((error) =>
        console.error("Error converting base64 to Blob:", error)
      );

    // Upload the enhanced image to Firebase Storage
    const enhancedUrl = await uploadImage(
      `drawing/enhanced-${Date.now()}.png`,
      enhancedBlob
    );

    // Prepare Firestore document data
    const currentUser = auth.currentUser;
    const drawingsCollection = collection(db, "Drawings");
    const themeRef = doc(db, "Themes", selectedScene);

    let userRef;
    if (currentUser) {
      userRef = doc(db, "Users", currentUser.email);
    } else {
      userRef = doc(db, "Users", "guest");
    }

    const drawingData = {
      created_at: new Date(),
      original_drawing: originalUrl,
      enhanced_drawings: [enhancedUrl],
      user_id: userRef,
      theme_id: themeRef,
      email: currentUser ? currentUser.email : "guest",
    };

    // Add the drawing data to Firestore
    const docRef = await addDoc(drawingsCollection, drawingData);

    navigate("/review", {
      state: { docId: docRef.id },
    });
  };

  const colors = useMemo(
    () => ["black", "red", "green", "orange", "blue", "purple"],
    []
  );

  const clearCanvas = () => {
    const canvas = canvasReference.current;
    const context = canvas.getContext("2d");
    context.fillStyle = "white";
    context.fillRect(0, 0, canvas.width, canvas.height);
  };

  const beginDraw = (e) => {
    contextReference.current.beginPath();
    const offsetX =
      e.nativeEvent.offsetX !== undefined
        ? e.nativeEvent.offsetX
        : e.touches[0].clientX -
          canvasReference.current.getBoundingClientRect().left;
    const offsetY =
      e.nativeEvent.offsetY !== undefined
        ? e.nativeEvent.offsetY
        : e.touches[0].clientY -
          canvasReference.current.getBoundingClientRect().top;
    contextReference.current.moveTo(offsetX, offsetY);
    setIsPressed(true);
  };

  const endDraw = () => {
    contextReference.current.closePath();
    setIsPressed(false);
  };

  const updateDraw = (e) => {
    if (!isPressed) return;

    const offsetX =
      e.nativeEvent.offsetX !== undefined
        ? e.nativeEvent.offsetX
        : (e.touches[0]?.clientX || 0) -
          canvasReference.current.getBoundingClientRect().left;
    const offsetY =
      e.nativeEvent.offsetY !== undefined
        ? e.nativeEvent.offsetY
        : (e.touches[0]?.clientY || 0) -
          canvasReference.current.getBoundingClientRect().top;

    contextReference.current.lineTo(offsetX, offsetY);
    contextReference.current.stroke();
  };

  useEffect(() => {
    const canvas = canvasReference.current;
    canvas.width = 500;
    canvas.height = 500;

    const context = canvas.getContext("2d");
    context.lineCap = "round";
    context.strokeStyle = colors[0];
    context.lineWidth = 5;
    contextReference.current = context;

    clearCanvas();
  }, [colors]);

  useEffect(() => {
    const canvas = canvasReference.current;
    const preventDefault = (e) => e.preventDefault();

    canvas.addEventListener("touchstart", preventDefault, { passive: false });
    canvas.addEventListener("touchmove", preventDefault, { passive: false });
    canvas.addEventListener("touchend", preventDefault, { passive: false });

    return () => {
      canvas.removeEventListener("touchstart", preventDefault);
      canvas.removeEventListener("touchmove", preventDefault);
      canvas.removeEventListener("touchend", preventDefault);
    };
  }, []);

  const setColor = (color) => {
    contextReference.current.strokeStyle = color;
    contextReference.current.lineWidth = 5;
    setLastColor(color);
    setMode("pencil");
  };

  const setEraser = () => {
    contextReference.current.strokeStyle = "white";
    contextReference.current.lineWidth = 10;
    setMode("eraser");
  };

  const handleDescribeDrawing = () => {
    setShowTextInput(true);
  };

  const handleTextSubmit = () => {
    const canvas = canvasReference.current;
    const context = canvas.getContext("2d");
    context.font = "20px Arial";
    context.fillStyle = "black";
    context.fillText(inputText, 50, 50); // Position text at 50, 50 for simplicity
    setInputText("");
    setShowTextInput(false);
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
      }}
    >
      <button
        className="completeButton"
        onClick={uploadDrawing}
        style={{ margin: "10px", padding: "10px 20px" }}
      >
        Upload
      </button>
      <button
        onClick={clearCanvas}
        style={{ margin: "10px", padding: "10px 20px" }}
      >
        Clear
      </button>
      <div className="DrawingPage">
        <canvas
          ref={canvasReference}
          onMouseDown={beginDraw}
          onMouseMove={updateDraw}
          onMouseUp={endDraw}
          onTouchStart={beginDraw}
          onTouchMove={updateDraw}
          onTouchEnd={endDraw}
        />
        <div className="buttons">
          {colors.map((color) => (
            <button
              className="colorButtons"
              key={color}
              onClick={() => setColor(color)}
              style={{ backgroundColor: color }}
            ></button>
          ))}
        </div>
      </div>
      <div
        className="tools"
        style={{ display: "flex", gap: "10px", marginTop: "10px" }}
      >
        <button
          onClick={() => setEraser()}
          style={{
            width: "60px",
            height: "60px",
            padding: "10px",
            background: `url(${eraserImage}) no-repeat center center`,
            backgroundSize: "cover",
            border: "none",
          }}
        ></button>
        <button
          onClick={() => setColor(lastColor)}
          style={{
            width: "60px",
            height: "60px",
            padding: "10px",
            background: `url(${penImage}) no-repeat center center`,
            backgroundSize: "cover",
            border: "none",
          }}
        ></button>
        <button
          onClick={handleDescribeDrawing}
          style={{ width: "60px", height: "60px" }}
        >
          Describe Drawing
        </button>
      </div>
      {showTextInput && (
        <div
          className="text-input"
          style={{
            display: "flex",
            gap: "10px",
            marginTop: "10px",
            alignItems: "center",
          }}
        >
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            style={{ width: "200px", height: "30px" }}
          />
          <button
            onClick={handleTextSubmit}
            style={{ width: "60px", height: "60px" }}
          >
            Enhance
          </button>
        </div>
      )}
    </div>
  );
}

export default DrawingPage;
