from fastapi import FastAPI, UploadFile, File
import cv2
import tempfile

app = FastAPI()

@app.post("/upload-videos")
async def upload_video(file: UploadFile = File(...)):

    # Creates a temporary filepath for the uploaded video, since OpenCV requires one.
    with tempfile.NamedTemporaryFile(delete = False, suffix = ".mp4") as temp:
        temp.write(await file.read())
        vid = cv2.VideoCapture(temp.name)

    # Turns the video into an array of frames to prepare for SAM 2 segmentation.
    frames = []
    while vid.isOpened():
        ret, frame = vid.read()
        if not ret:
            break
        frames.append(frame)

    # Tests the frames by presenting them in OpenCV.
    for frame in frames:
        cv2.imshow("Video Playback", frame)
        if (
            cv2.waitKey(25) & 0xFF == ord("q") or cv2.getWindowProperty("Video Playback", cv2.WND_PROP_VISIBLE) < 1
        ):
            break
    cv2.destroyAllWindows()