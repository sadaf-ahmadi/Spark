import React, { useRef, useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { storage, db, auth } from "../firebase/firebase";
import {
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
} from "firebase/storage";
import { collection, addDoc, doc } from "firebase/firestore";
import Canvas from "../components/Canvas";
import Toolbox from "../components/Toolbox";
import ColorPicker from "../components/ColorPicker";
import LineWidthPicker from "../components/LineWidthPicker";
import ActionButtons from "../components/ActionButton";
import "./DrawingPage.css";

function DrawingPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const canvasRef = useRef(null);
  const [isPressed, setIsPressed] = useState(false);
  const [selectedColor, setSelectedColor] = useState("black");
  const [mode, setMode] = useState("pencil");
  const [showTextInput, setShowTextInput] = useState(false);
  const [inputText, setInputText] = useState("");
  const { selectedScene, area } = location.state || {};
  const [showColorPopup, setShowColorPopup] = useState(false);
  const [lineWidth, setLineWidth] = useState(5);
  const [showEraserPopup, setShowEraserPopup] = useState(false);
  const [showFillPopup, setShowFillPopup] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [colors, setColors] = useState([
    "black",
    "red",
    "green",
    "orange",
    "blue",
    "purple",
  ]);
  const [isUploading, setIsUploading] = useState(false); 
  const [scale, setScale] = useState(1);
  const [origin, setOrigin] = useState({ x: 0, y: 0 });
  const [isPinching, setIsPinching] = useState(false);
  const lastTouchDistanceRef = useRef(null);
  const [isZooming, setIsZooming] = useState(false);

  const handleUploadClick = () => {
    setShowTextInput(true);
  };

  const handleTextSubmit = async () => {
    setIsUploading(true); // Set uploading state to true
    setShowTextInput(false);

    console.log("User's input:", inputText);

    await uploadDrawing(inputText); // Pass the user input directly to uploadDrawing
    setIsUploading(false); // Set uploading state to false after upload completes
  };

  const uploadDrawing = async (prompt) => {
    const canvas = canvasRef.current;
    const base64Image = canvas.toDataURL("image/png");

    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/png")
    );
    if (!blob) return;

    const displayArea =
      area === "air"
        ? "top"
        : area === "land"
        ? "center"
        : area === "water"
        ? "bottom"
        : "undefined";

    let originalUrl = "";
    const uploadImage = async (path, imageBlob) => {
      const storageReference = storageRef(storage, path);
      const snapshot = await uploadBytes(storageReference, imageBlob);
      return getDownloadURL(snapshot.ref);
    };

    originalUrl = await uploadImage(`drawing/original-${Date.now()}.png`, blob);

    const sendToBaseten = async (base64Img, prompt) => {
      const url = "/model_versions/q48rmd3/predict"; // Replace with your Baseten endpoint
      const headers = {
        Authorization: "Api-Key 13235osK.AVglR2jVhzMHR1txMuFJCD49TEmV6FXY",
        "Content-Type": "application/json",
      };

      const imageData = base64Img.split(",")[1];
      const data = {
        prompt: prompt || "a polarbear", // Use the prompt passed to this function
        images_data: imageData,
        guidance_scale: 8,
        lcm_steps: 50,
        seed: 2159232,
        num_inference_steps: 4,
        strength: 0.7,
        width: 512,
        height: 512,
      };

      console.log("Data being sent to Baseten:", data);

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

    const enhancedBase64 = await sendToBaseten(base64Image, prompt);
    if (!enhancedBase64) return;

    const enhancedBlob = await fetch(enhancedBase64)
      .then((res) => res.blob())
      .catch((error) =>
        console.error("Error converting base64 to Blob:", error)
      );

    const enhancedUrl = await uploadImage(
      `drawing/enhanced-${Date.now()}.png`,
      enhancedBlob
    );

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
      displayArea: displayArea,
      isReviewed: false,
    };

    const docRef = await addDoc(drawingsCollection, drawingData);

    navigate("/review", {
      state: { docId: docRef.id },
    });
  };

  const generateRandomColors = () => {
    const canvas = canvasRef.current;
    const currentDrawing = canvas.toDataURL();

    const randomColors = [];
    while (randomColors.length < 6) {
      let color;
      let isUnique = true;

      do {
        color = `#${Math.floor(Math.random() * 16777215)
          .toString(16)
          .padStart(6, "0")}`;
        isUnique = true;

        // Avoid white color
        if (color.toLowerCase() === "#ffffff") {
          isUnique = false;
          continue;
        }

        // Check if the color is similar to existing colors
        for (let i = 0; i < randomColors.length; i++) {
          if (isColorSimilar(color, randomColors[i])) {
            isUnique = false;
            break;
          }
        }
      } while (!isUnique);

      randomColors.push(color);
    }

    setColors(randomColors);

    const context = canvas.getContext("2d");
    const img = new Image();
    img.src = currentDrawing;
    img.onload = () => {
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(img, 0, 0);
    };
  };

  const isColorSimilar = (color1, color2) => {
    const rgb1 = hexToRgb(color1);
    const rgb2 = hexToRgb(color2);
    const threshold = 50;

    return (
      Math.abs(rgb1.r - rgb2.r) < threshold &&
      Math.abs(rgb1.g - rgb2.g) < threshold &&
      Math.abs(rgb1.b - rgb2.b) < threshold
    );
  };

  // Function to convert hex color to RGB
  const hexToRgb = (hex) => {
    const bigint = parseInt(hex.slice(1), 16);
    return {
      r: (bigint >> 16) & 255,
      g: (bigint >> 8) & 255,
      b: bigint & 255,
    };
  };

  const updateDraw = (e) => {

    if (!isPressed) return;
    // if (!isPressed || isZooming) return;
    setShowColorPopup(false);
    setShowEraserPopup(false);
    setShowFillPopup(false);

    const canvas = canvasRef.current;
    const offsetX =
      e.nativeEvent.offsetX !== undefined
        ? e.nativeEvent.offsetX
        : (e.touches[0]?.clientX || 0) - canvas.getBoundingClientRect().left;
    const offsetY =
      e.nativeEvent.offsetY !== undefined
        ? e.nativeEvent.offsetY
        : (e.touches[0]?.clientY || 0) - canvas.getBoundingClientRect().top;

    const context = canvas.getContext("2d");
    if (mode === "eraser") {
      context.globalCompositeOperation = "destination-out";
      context.strokeStyle = "rgba(0,0,0,1)";
    } else {
      context.globalCompositeOperation = "source-over";
      context.strokeStyle = selectedColor;
    }
  
    context.lineWidth = lineWidth;
    context.lineCap = "round";
    context.lineJoin = "round";
  
    context.lineTo(offsetX, offsetY);
    context.stroke();
    context.beginPath();
    context.moveTo(offsetX, offsetY);
  };

  const setColor = (color) => {
    const context = canvasRef.current.getContext("2d");
    context.strokeStyle = color;
    setSelectedColor(color);
    setMode("pencil");
  };

  const toggleColorPicker = () => {
    setShowEraserPopup(false);
    setShowColorPopup(!showColorPopup);
    setShowFillPopup(false);
  };

  const setWidth = (width) => {
    const context = canvasRef.current.getContext("2d");
    context.lineWidth = width;
    setLineWidth(width);
  };

  const setEraser = () => {
    setShowEraserPopup(!showEraserPopup);
    setShowColorPopup(false);
    setShowFillPopup(false);
    setMode("eraser");
  };

  const handleDescribeDrawing = () => {
    setShowTextInput(true);
  };

  const handleFill = () => {
    setShowColorPopup(false);
    setShowEraserPopup(false);
    setShowFillPopup(!showFillPopup);
    setMode("fill");
  };

  const drawingRef = useRef(null); // Ref to store current drawing

  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      if (canvas) {
        // Save current drawing to a data URL
        drawingRef.current = canvas.toDataURL();

        // Resize the canvas
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        // Restore the saved drawing
        const context = canvas.getContext("2d");
        const img = new Image();
        img.src = drawingRef.current;
        img.onload = () => {
          context.drawImage(img, 0, 0);
        };
      }
    };

    window.addEventListener("resize", handleResize);

    // Initial resize
    handleResize();

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  const saveHistory = () => {
    const canvas = canvasRef.current;
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(canvas.toDataURL());
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  const undo = () => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      const canvas = canvasRef.current;
      const context = canvas.getContext("2d");
      const img = new Image();
      img.src = history[newIndex];
      img.onload = () => {
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(img, 0, 0);
      };
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      const canvas = canvasRef.current;
      const context = canvas.getContext("2d");
      const img = new Image();
      img.src = history[newIndex];
      img.onload = () => {
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(img, 0, 0);
      };
    }
  };

  useEffect(() => {
    if (canvasRef.current) {
      saveHistory();
    }
  }, []);

  useEffect(() => {
    if (!isPressed) {
      saveHistory();
    }
  }, [isPressed]);

  //fill functionality
  const floodFill = (x, y, fillColor) => {
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    console.log("this is inside flood fill");
    const targetColor = getColorAtPixel(data, x, y);
    if (colorsMatch(targetColor, fillColor)) {
      console.log("inside colour match");
      return;
    }

    const stack = [[x, y]];
    while (stack.length > 0) {
      console.log("stack length > 0");
      const [cx, cy] = stack.pop();

      if (cx < 0 || cy < 0 || cx >= canvas.width || cy >= canvas.height) {
        continue;
      }

      const currentIndex = (cy * canvas.width + cx) * 4;
      if (!colorsMatch(getColorAtPixel(data, cx, cy), targetColor)) {
        continue;
      }

      setColorAtPixel(data, cx, cy, fillColor);
      stack.push([cx + 1, cy]);
      stack.push([cx - 1, cy]);
      stack.push([cx, cy + 1]);
      stack.push([cx, cy - 1]);
    }

    context.putImageData(imageData, 0, 0);
    saveHistory(); // Save the state after filling
  };

  const getColorAtPixel = (data, x, y) => {
    const index = (y * canvasRef.current.width + x) * 4;
    return [data[index], data[index + 1], data[index + 2], data[index + 3]];
  };

  const setColorAtPixel = (data, x, y, color) => {
    const index = (y * canvasRef.current.width + x) * 4;
    data[index] = color[0];
    data[index + 1] = color[1];
    data[index + 2] = color[2];
    data[index + 3] = color[3];
  };

  const colorsMatch = (color1, color2) => {
    return (
      color1[0] === color2[0] &&
      color1[1] === color2[1] &&
      color1[2] === color2[2] &&
      color1[3] === color2[3]
    );
  };

  const hexToRGBA = (hex) => {
    let r = 0,
      g = 0,
      b = 0,
      a = 255;
    if (hex.length === 7) {
      r = parseInt(hex.slice(1), 16);
      g = parseInt(hex.slice(3), 16);
      b = parseInt(hex.slice(5, 7), 16);
    }
    return [r, g, b, a];
  };

  const handleCanvasClick = (event) => {
    console.log("canvas is clicked");
    if (mode === "fill") {
      console.log("mode is fill");
      // const canvas = canvasRef.current;
      // const rect = canvas.getBoundingClientRect();
      // const x = event.clientX - rect.left;
      // const y = event.clientY - rect.top;
      // const fillColor = hexToRGBA(selectedColor);

      // floodFill(x, y, fillColor);
    }
  };

  // useEffect(() => {
  //   const canvas = canvasRef.current;
  //   const preventDefault = (e) => e.preventDefault();

  //   const handleWheel = (e) => {
  //     e.preventDefault();
  //     setIsZooming(true);
  //     const scaleAmount = -e.deltaY * 0.01;
  //     setScale((prevScale) => Math.min(Math.max(0.5, prevScale + scaleAmount), 3));
  //     setTimeout(() => setIsZooming(false), 4000);
  //   };

  //   const handlePinchStart = (e) => {
  //     if (e.touches.length === 2) {
  //       const touchDistance = getTouchDistance(e.touches);
  //       lastTouchDistanceRef.current = touchDistance;
  //       setIsPinching(true);
  //       setIsZooming(true);
  //     }
  //   };

  //   const handlePinchMove = (e) => {
  //     if (e.touches.length === 2) {
  //       const touchDistance = getTouchDistance(e.touches);
  //       if (lastTouchDistanceRef.current) {
  //         const scaleAmount = touchDistance / lastTouchDistanceRef.current;
  //         setScale((prevScale) => Math.min(Math.max(0.5, prevScale * scaleAmount), 3));
  //         lastTouchDistanceRef.current = touchDistance;
  //         setIsZooming(true);
  //         setTimeout(() => setIsZooming(false), 4000);
  //       }
  //     }
  //   };

  //   const getTouchDistance = (touches) => {
  //     const dx = touches[0].clientX - touches[1].clientX;
  //     const dy = touches[0].clientY - touches[1].clientY;
  //     return Math.sqrt(dx * dx + dy * dy);
  //   };

  //   canvas.addEventListener("wheel", handleWheel);
  //   canvas.addEventListener("touchstart", handlePinchStart, { passive: false });
  //   canvas.addEventListener("touchmove", handlePinchMove, { passive: false });
  //   canvas.addEventListener("touchstart", preventDefault, { passive: false });
  //   canvas.addEventListener("touchmove", preventDefault, { passive: false });
  //   canvas.addEventListener("touchend", preventDefault, { passive: false });

  //   return () => {
  //     canvas.removeEventListener("wheel", handleWheel);
  //     canvas.removeEventListener("touchstart", handlePinchStart);
  //     canvas.removeEventListener("touchmove", handlePinchMove);
  //     canvas.removeEventListener("touchstart", preventDefault);
  //     canvas.removeEventListener("touchmove", preventDefault);
  //     canvas.removeEventListener("touchend", preventDefault);
  //   };
  // }, [scale]);

  return (
    <div className="DrawingPage">
      <div className="top-toolbar">
        <ActionButtons
          onClear={() => {
            const canvas = canvasRef.current;
            const context = canvas.getContext("2d");
            context.clearRect(0, 0, canvas.width, canvas.height);
            saveHistory();
          }}
          onUndo={undo}
          onRedo={redo}
          undoDisabled={historyIndex <= 0}
          redoDisabled={historyIndex >= history.length - 1}
        />
        <button className="completeButton" onClick={handleUploadClick}>
          Upload
        </button>
      </div>
      <div
      className="canvas-container"
      onMouseDown={() => setIsPressed(true)}
      onMouseUp={() => setIsPressed(false)}
      onMouseMove={updateDraw}
      onMouseLeave={() => setIsPressed(false)}
      onClick={handleCanvasClick}
    >
        <Canvas
          ref={canvasRef}
          colors={colors}
          selectedColor={selectedColor}
          lineWidth={lineWidth}
          mode={mode}
          setIsPressed={setIsPressed}
          updateDraw={updateDraw}
          scale={scale}
          origin={origin}
          isZooming={isZooming}
        />
      </div>
      <div className="bottom-toolbar">
        <Toolbox
          setEraser={setEraser}
          toggleColorPicker={toggleColorPicker}
          handleFill={handleFill}
          handleDescribeDrawing={handleDescribeDrawing}
          mode={mode}
          setMode={setMode}
        />
        {showFillPopup && (
          <div className="popup">
            <ColorPicker
              colors={colors}
              selectedColor={selectedColor}
              setColor={setColor}
              showColorPopup={showFillPopup}
              generateRandomColors={generateRandomColors}
              floodFill={floodFill}
              canvasRef={canvasRef}
            />
          </div>
        )}
        {showColorPopup && (
          <div className="popup">
            <div className="color-picker-wrapper">
              <ColorPicker
                colors={colors}
                selectedColor={selectedColor}
                setColor={setColor}
                showColorPopup={showColorPopup}
                generateRandomColors={generateRandomColors}
                canvasRef={canvasRef}
              />
              <div className="divider"></div>
              <LineWidthPicker
                setWidth={setWidth}
                lineWidth={lineWidth}
                showLineWidthPopup={showColorPopup}
              />
            </div>
          </div>
        )}

        {showEraserPopup && (
          <div className="popup">
            <LineWidthPicker
              setWidth={setWidth}
              lineWidth={lineWidth}
              showLineWidthPopup={showEraserPopup}
            />
          </div>
        )}
      </div>

      {showTextInput && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 1000,
          }}
        >
          <div
            style={{
              backgroundColor: "white",
              padding: "20px",
              borderRadius: "10px",
              width: "90%",
              maxWidth: "500px",
              textAlign: "center",
            }}
          >
            <h2 style={{ marginBottom: "20px" , fontWeight:"normal" }}>Enter a prompt for AI to enhance your drawing:</h2>
            <div
              className="text-input"
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "10px",
              }}
            >
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px",
                  borderRadius: "5px",
                  border: "1px solid #ccc",
                  fontSize: "16px",
                  marginBottom: "10px",
                  margin:"5px",
                }}
              />
              <button
              className="completeButton"
                onClick={handleTextSubmit}
                disabled={isUploading}
                
              >
                <svg width="20" height="18" viewBox="0 0 20 18" fill="none" xmlns="http://www.w3.org/2000/svg" className="buttonIcon">
                  <path d="M1 21L14.8462 7.15385M17.9231 4.07692L19.4615 2.53846M14.0769 3.30769V1M18.6923 7.92308H21M17.1538 11L18.6923 12.5385M9.46154 3.30769L11 4.84615" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                AI Enhance
              </button>
            </div>
          </div>
        </div>
      )}

{isUploading && (
  <div
    style={{
      position: "fixed",
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
      backgroundColor: "rgba(0, 0, 0, 0.5)",
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      alignItems: "center",
      zIndex: 1000,
      color: "white",
      fontSize: "24px",
    }}
  >
    <div>Loading...</div>
    <div className="loading-dots">
      <div className="dot"></div>
      <div className="dot"></div>
      <div className="dot"></div>
    </div>
  </div>
)}
    </div>
  );
}

export default DrawingPage;
