import argparse
import os
from typing import Optional

import cv2
import numpy as np
import subprocess
import torch
import torchaudio
import whisper
from transformers import AutoTokenizer

from models import MultimodalSentimentModel

EMOTION_MAP = {0: "anger", 1: "disgust", 2: "fear",
               3: "joy", 4: "neutral", 5: "sadness", 6: "surprise"}
SENTIMENT_MAP = {0: "negative", 1: "neutral", 2: "positive"}

NUM_FRAMES = 30
FRAME_SIZE = 224
SAMPLE_RATE = 16000
MEL_BINS = 64
MEL_FFT = 1024
MEL_HOP = 512
MEL_MAX_LENGTH = 300
TEXT_MAX_LENGTH = 128
MAX_BATCH_SIZE = 16


class VideoProcessor:
    """Opens video once and extracts frames for multiple segments by seeking."""

    def __init__(self, video_path: str):
        self.cap = cv2.VideoCapture(video_path)
        if not self.cap.isOpened():
            raise ValueError(f"Cannot open video: {video_path}")

    def extract_segment_frames(self, start_time: float, end_time: float) -> torch.Tensor:
        self.cap.set(cv2.CAP_PROP_POS_MSEC, start_time * 1000)

        frames = []
        end_ms = end_time * 1000

        while len(frames) < NUM_FRAMES:
            if self.cap.get(cv2.CAP_PROP_POS_MSEC) > end_ms:
                break
            ret, frame = self.cap.read()
            if not ret:
                break
            frame = cv2.resize(frame, (FRAME_SIZE, FRAME_SIZE))
            frame = frame / 255.0
            frames.append(frame)

        if len(frames) == 0:
            raise ValueError(f"No frames for segment {start_time:.2f}-{end_time:.2f}")

        if len(frames) < NUM_FRAMES:
            frames += [np.zeros_like(frames[0])] * (NUM_FRAMES - len(frames))
        else:
            frames = frames[:NUM_FRAMES]

        return torch.FloatTensor(np.array(frames)).permute(0, 3, 1, 2)

    def close(self):
        self.cap.release()


class AudioProcessor:
    """Extracts audio once from the full video and computes mel spectrograms
    for individual segments by slicing the waveform in memory."""

    def __init__(self, video_path: str):
        self.audio_path = video_path.rsplit('.', 1)[0] + '_full_audio.wav'
        subprocess.run([
            'ffmpeg', '-y',
            '-i', video_path,
            '-vn', '-acodec', 'pcm_s16le',
            '-ar', str(SAMPLE_RATE), '-ac', '1',
            self.audio_path
        ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

        self.waveform, sr = torchaudio.load(self.audio_path)
        if sr != SAMPLE_RATE:
            self.waveform = torchaudio.transforms.Resample(sr, SAMPLE_RATE)(self.waveform)

        self.mel_transform = torchaudio.transforms.MelSpectrogram(
            sample_rate=SAMPLE_RATE,
            n_mels=MEL_BINS,
            n_fft=MEL_FFT,
            hop_length=MEL_HOP,
        )

    def extract_segment_features(self, start_time: float, end_time: float) -> torch.Tensor:
        start_sample = max(0, int(start_time * SAMPLE_RATE))
        end_sample = min(self.waveform.size(1), int(end_time * SAMPLE_RATE))

        segment = self.waveform[:, start_sample:end_sample]

        if segment.size(1) == 0:
            return torch.zeros(1, MEL_BINS, MEL_MAX_LENGTH)

        mel_spec = self.mel_transform(segment)

        std = mel_spec.std()
        if std > 0:
            mel_spec = (mel_spec - mel_spec.mean()) / std

        if mel_spec.size(2) < MEL_MAX_LENGTH:
            mel_spec = torch.nn.functional.pad(mel_spec, (0, MEL_MAX_LENGTH - mel_spec.size(2)))
        else:
            mel_spec = mel_spec[:, :, :MEL_MAX_LENGTH]

        return mel_spec

    def cleanup(self):
        if os.path.exists(self.audio_path):
            os.remove(self.audio_path)


def _assign_speaker(segment: dict, diarization) -> Optional[str]:
    speaker_overlap: dict[str, float] = {}
    for turn, _, speaker in diarization.itertracks(yield_label=True):
        overlap = max(0.0, min(segment["end"], turn.end) - max(segment["start"], turn.start))
        if overlap > 0:
            speaker_overlap[speaker] = speaker_overlap.get(speaker, 0.0) + overlap
    return max(speaker_overlap, key=speaker_overlap.get) if speaker_overlap else None


def _load_diarization_pipeline():
    hf_token = os.environ.get("HF_TOKEN")
    if not hf_token:
        print("HF_TOKEN not set — speaker diarization disabled")
        return None
    try:
        from pyannote.audio import Pipeline
        pipeline = Pipeline.from_pretrained(
            "pyannote/speaker-diarization-3.1",
            use_auth_token=hf_token,
        )
        return pipeline
    except Exception as e:
        print(f"Speaker diarization unavailable: {e}")
        return None


def load_model(model_dir: str) -> dict:
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = MultimodalSentimentModel().to(device)

    model_path = os.path.join(model_dir, 'model.pth')
    if not os.path.exists(model_path):
        model_path = os.path.join(model_dir, "model", 'model.pth')
        if not os.path.exists(model_path):
            raise FileNotFoundError(
                "Model file not found in path " + model_path)

    print("Loading model from path: " + model_path)
    model.load_state_dict(torch.load(
        model_path, map_location=device, weights_only=True))
    model.eval()

    return {
        'model': model,
        'tokenizer': AutoTokenizer.from_pretrained('bert-base-uncased'),
        'transcriber': whisper.load_model(
            "base",
            device="cpu" if device.type == "cpu" else device,
        ),
        'diarization': _load_diarization_pipeline(),
        'device': device
    }


def predict_fn(input_data, model_dict):
    model = model_dict['model']
    tokenizer = model_dict['tokenizer']
    device = model_dict['device']
    video_path = input_data['video_path']

    # 1. Transcribe with Whisper base (unchanged for accuracy)
    result = model_dict['transcriber'].transcribe(
        video_path, word_timestamps=True)

    segments = result["segments"]
    if not segments:
        return {"utterances": []}

    # 2. Extract audio once — reused for both features and diarization
    audio_proc = AudioProcessor(video_path)
    video_proc = VideoProcessor(video_path)

    diarization_pipeline = model_dict.get('diarization')
    diarization = None
    if diarization_pipeline is not None:
        try:
            diarization = diarization_pipeline(audio_proc.audio_path)
        except Exception as e:
            print(f"Diarization failed, continuing without speaker labels: {e}")

    # 3. Extract features for all segments (no FFmpeg per segment)
    valid_indices: list[int] = []
    all_video_frames: list[torch.Tensor] = []
    all_audio_features: list[torch.Tensor] = []
    all_input_ids: list[torch.Tensor] = []
    all_attention_masks: list[torch.Tensor] = []

    for i, segment in enumerate(segments):
        try:
            video_frames = video_proc.extract_segment_frames(
                segment["start"], segment["end"])
            audio_features = audio_proc.extract_segment_features(
                segment["start"], segment["end"])
            text_inputs = tokenizer(
                segment["text"],
                padding="max_length",
                truncation=True,
                max_length=TEXT_MAX_LENGTH,
                return_tensors="pt",
            )

            all_video_frames.append(video_frames)
            all_audio_features.append(audio_features)
            all_input_ids.append(text_inputs["input_ids"])
            all_attention_masks.append(text_inputs["attention_mask"])
            valid_indices.append(i)
        except Exception as e:
            print(f"Segment {i} feature extraction failed: {e}")

    video_proc.close()
    audio_proc.cleanup()

    if not valid_indices:
        return {"utterances": []}

    # 4. Batched inference — tensors stay on CPU, chunks moved to device
    video_batch = torch.stack(all_video_frames)
    audio_batch = torch.stack(all_audio_features)
    input_ids_batch = torch.cat(all_input_ids)
    attention_mask_batch = torch.cat(all_attention_masks)

    all_emotion_probs: list[torch.Tensor] = []
    all_sentiment_probs: list[torch.Tensor] = []
    total = len(valid_indices)

    with torch.inference_mode():
        for start in range(0, total, MAX_BATCH_SIZE):
            end = min(start + MAX_BATCH_SIZE, total)
            text_chunk = {
                "input_ids": input_ids_batch[start:end].to(device),
                "attention_mask": attention_mask_batch[start:end].to(device),
            }
            outputs = model(
                text_chunk,
                video_batch[start:end].to(device),
                audio_batch[start:end].to(device),
            )
            all_emotion_probs.append(
                torch.softmax(outputs["emotions"], dim=1).cpu())
            all_sentiment_probs.append(
                torch.softmax(outputs["sentiments"], dim=1).cpu())

    emotion_probs = torch.cat(all_emotion_probs)
    sentiment_probs = torch.cat(all_sentiment_probs)

    # 5. Assemble results
    predictions = []
    for batch_idx, seg_idx in enumerate(valid_indices):
        seg = segments[seg_idx]
        emotion_values, emotion_indices = torch.topk(emotion_probs[batch_idx], 3)
        sentiment_values, sentiment_indices = torch.topk(
            sentiment_probs[batch_idx], 3)

        predictions.append({
            "start_time": seg["start"],
            "end_time": seg["end"],
            "text": seg["text"],
            "speaker": _assign_speaker(seg, diarization) if diarization else None,
            "emotions": [
                {"label": EMOTION_MAP[idx.item()], "confidence": conf.item()}
                for idx, conf in zip(emotion_indices, emotion_values)
            ],
            "sentiments": [
                {"label": SENTIMENT_MAP[idx.item()], "confidence": conf.item()}
                for idx, conf in zip(sentiment_indices, sentiment_values)
            ],
        })

    return {"utterances": predictions}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run local video sentiment inference")
    parser.add_argument("video_path", help="Path to input video file")
    parser.add_argument("--model-dir", default="../../model_normalized",
                        help="Directory containing model.pth (default: ../../model_normalized)")
    args = parser.parse_args()

    model_dict = load_model(args.model_dir)
    predictions = predict_fn({"video_path": args.video_path}, model_dict)

    for utterance in predictions["utterances"]:
        print("\nUtterance:")
        print(f"Start: {utterance['start_time']}s, End: {utterance['end_time']}s")
        print(f"Text: {utterance['text']}")
        print("\nTop Emotions:")
        for emotion in utterance['emotions']:
            print(f"  {emotion['label']}: {emotion['confidence']:.2f}")
        print("\nTop Sentiments:")
        for sentiment in utterance['sentiments']:
            print(f"  {sentiment['label']}: {sentiment['confidence']:.2f}")
        print("-" * 50)
