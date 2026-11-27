import argparse
import os
import subprocess
from concurrent.futures import ThreadPoolExecutor
from typing import Optional

import cv2
import numpy as np
import torch
import torchaudio
import whisper
from transformers import AutoTokenizer

from models import MultimodalSentimentModel

EMOTION_MAP = {0: "anger", 1: "disgust", 2: "fear",
               3: "joy", 4: "neutral", 5: "sadness", 6: "surprise"}
SENTIMENT_MAP = {0: "negative", 1: "neutral", 2: "positive"}


class VideoProcessor:
    def process_video(self, video_path):
        cap = cv2.VideoCapture(video_path)
        frames = []

        try:
            if not cap.isOpened():
                raise ValueError(f"Video not found: {video_path}")

            # Try and read first frame to validate video
            ret, frame = cap.read()
            if not ret or frame is None:
                raise ValueError(f"Video not found: {video_path}")

            # Reset index to not skip first frame
            cap.set(cv2.CAP_PROP_POS_FRAMES, 0)

            while len(frames) < 30 and cap.isOpened():
                ret, frame = cap.read()
                if not ret:
                    break

                frame = cv2.resize(frame, (224, 224))
                frame = frame / 255.0
                frames.append(frame)

        except Exception as e:
            raise ValueError(f"Video error: {str(e)}")
        finally:
            cap.release()

        if (len(frames) == 0):
            raise ValueError("No frames could be extracted")

        # Pad or truncate frames
        if len(frames) < 30:
            frames += [np.zeros_like(frames[0])] * (30 - len(frames))
        else:
            frames = frames[:30]

        # Before permute: [frames, height, width, channels]
        # After permute: [frames, channels, height, width]
        return torch.FloatTensor(np.array(frames)).permute(0, 3, 1, 2)


class AudioProcessor:
    def extract_features(self, video_path, max_length=300):
        audio_path = video_path.replace('.mp4', '.wav')

        try:
            subprocess.run([
                'ffmpeg',
                '-i', video_path,
                '-vn',
                '-acodec', 'pcm_s16le',
                '-ar', '16000',
                '-ac', '1',
                audio_path
            ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

            waveform, sample_rate = torchaudio.load(audio_path)

            if sample_rate != 16000:
                resampler = torchaudio.transforms.Resample(sample_rate, 16000)
                waveform = resampler(waveform)

            mel_spectrogram = torchaudio.transforms.MelSpectrogram(
                sample_rate=16000,
                n_mels=64,
                n_fft=1024,
                hop_length=512
            )

            mel_spec = mel_spectrogram(waveform)

            # Normalize
            mel_spec = (mel_spec - mel_spec.mean()) / mel_spec.std()

            if mel_spec.size(2) < 300:
                padding = 300 - mel_spec.size(2)
                mel_spec = torch.nn.functional.pad(mel_spec, (0, padding))
            else:
                mel_spec = mel_spec[:, :, :300]

            return mel_spec

        except subprocess.CalledProcessError as e:
            raise ValueError(f"Audio extraction error: {str(e)}")
        except Exception as e:
            raise ValueError(f"Audio error: {str(e)}")
        finally:
            if os.path.exists(audio_path):
                os.remove(audio_path)


class VideoUtteranceProcessor:
    def __init__(self):
        self.video_processor = VideoProcessor()
        self.audio_processor = AudioProcessor()

    def extract_segment(self, video_path, start_time, end_time, temp_dir="/tmp"):
        os.makedirs(temp_dir, exist_ok=True)
        segment_path = os.path.join(
            temp_dir, f"segment_{start_time}_{end_time}.mp4")

        # -ss before -i jumps to the line; after -i, ffmpeg decoded from 0:00
        # for every line, so late lines got slower. Video frames match the old
        # cut; audio can differ in AAC noise-fill detail (5-clip spot check
        # 2026-11-15: same labels; full parity run not finished). The end is
        # a length (-t): "-to" before -i keeps one extra frame.
        subprocess.run([
            "ffmpeg",
            "-ss", str(start_time),
            "-i", video_path,
            "-t", f"{end_time - start_time:.6f}",
            "-c:v", "libx264",
            "-c:a", "aac",
            "-y",
            segment_path
        ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

        if not os.path.exists(segment_path) or os.path.getsize(segment_path) == 0:
            raise ValueError("Segment extraction failed: " + segment_path)

        return segment_path


def _assign_speaker(segment: dict, diarization) -> Optional[str]:
    speaker_overlap: dict[str, float] = {}
    for turn, _, speaker in diarization.itertracks(yield_label=True):
        overlap = max(0.0, min(segment["end"], turn.end) - max(segment["start"], turn.start))
        if overlap > 0:
            speaker_overlap[speaker] = speaker_overlap.get(speaker, 0) + overlap
    return max(speaker_overlap, key=speaker_overlap.get) if speaker_overlap else None


ALLOWED_DEVICES = ("cpu", "mps", "cuda")


def _pick_device() -> torch.device:
    """INFERENCE_DEVICE=mps runs the emotion model and speaker detection on
    the Mac GPU. Unset keeps the validated default: CUDA if present, else CPU.
    Enable mps only after a parity run (parity/compare_runs.py) on your videos."""
    requested = os.environ.get("INFERENCE_DEVICE", "").strip().lower()
    if not requested:
        return torch.device("cuda" if torch.cuda.is_available() else "cpu")
    if requested not in ALLOWED_DEVICES:
        raise ValueError(f"INFERENCE_DEVICE must be one of {', '.join(ALLOWED_DEVICES)}, not {requested!r}")
    if requested == "mps" and not torch.backends.mps.is_available():
        raise ValueError("INFERENCE_DEVICE=mps, but this machine has no usable Mac GPU")
    return torch.device(requested)


def _load_diarization_pipeline(device: torch.device):
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
        if device.type == "mps":
            # 8x faster with identical speaker turns on the parity test video.
            pipeline.to(device)
        return pipeline
    except Exception as e:
        print(f"Speaker diarization unavailable: {e}")
        return None


def load_model(model_dir: str) -> dict:
    device = _pick_device()
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
        # Whisper stays on the CPU on a Mac: the lines it finds are the
        # utterances, so moving it would change every downstream input.
        'transcriber': whisper.load_model(
            "base",
            device=device if device.type == "cuda" else "cpu",
        ),
        'diarization': _load_diarization_pipeline(device),
        'device': device
    }


def _diarize(diarization_pipeline, video_path):
    """Speaker turns for the whole video, run once over the full audio.
    Returns (diarization or None, path of the temporary wav)."""
    diarization_audio_path = video_path.rsplit('.', 1)[0] + '_diarize.wav'
    try:
        subprocess.run([
            'ffmpeg', '-y', '-i', video_path,
            '-vn', '-acodec', 'pcm_s16le', '-ar', '16000', '-ac', '1',
            diarization_audio_path
        ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        diarization = diarization_pipeline(diarization_audio_path, min_speakers=2, max_speakers=8)
        if diarization is not None:
            detected = set(speaker for _, _, speaker in diarization.itertracks(yield_label=True))
            print(f"[diarization] detected {len(detected)} speakers: {detected}")
        return diarization, diarization_audio_path
    except Exception as e:
        print(f"Diarization failed, continuing without speaker labels: {e}")
        return None, diarization_audio_path


def predict_fn(input_data, model_dict):
    model = model_dict['model']
    tokenizer = model_dict['tokenizer']
    device = model_dict['device']
    video_path = input_data['video_path']

    # Speaker detection does not need the transcript, so it runs in a thread
    # while Whisper transcribes (with INFERENCE_DEVICE=mps they even use
    # different hardware). Each produces exactly what it did when run in turn.
    diarization_pipeline = model_dict.get('diarization')
    diarization_audio_path = None
    try:
        with ThreadPoolExecutor(max_workers=1) as speaker_pool:
            speakers = (speaker_pool.submit(_diarize, diarization_pipeline, video_path)
                        if diarization_pipeline is not None else None)
            try:
                result = model_dict['transcriber'].transcribe(
                    video_path, word_timestamps=True)
            finally:
                diarization, diarization_audio_path = speakers.result() if speakers else (None, None)
        return _predict_lines(result, diarization, video_path, model, tokenizer, device)
    finally:
        if diarization_audio_path and os.path.exists(diarization_audio_path):
            os.remove(diarization_audio_path)


def _predict_lines(result, diarization, video_path, model, tokenizer, device):
    utterance_processor = VideoUtteranceProcessor()
    predictions = []

    # CPU-bound per-segment prep (ffmpeg subprocess + cv2 decode + torchaudio
    # mel-spec + tokenizer) runs in a thread pool. ffmpeg releases the GIL
    # inside subprocess.run, tokenizer (BertTokenizerFast) is thread-safe, and
    # cv2/torchaudio work on isolated per-call paths and tensors. The model
    # forward itself stays serial on the main thread: the GPU is shared with
    # Whisper and pyannote and this pipeline is not thread-safe across them.
    # Inputs reaching the model are byte-identical to the serial version
    # (same ffmpeg command, same codecs, same resize/mel-spec params) so
    # accuracy is unchanged.
    def _prep_segment(segment):
        try:
            segment_path = utterance_processor.extract_segment(
                video_path, segment["start"], segment["end"]
            )
        except Exception as e:
            return {"segment": segment, "error": f"extract_segment: {e}", "segment_path": None}
        try:
            video_frames = utterance_processor.video_processor.process_video(segment_path)
            audio_features = utterance_processor.audio_processor.extract_features(segment_path)
            text_inputs = tokenizer(
                segment["text"],
                padding="max_length",
                truncation=True,
                max_length=128,
                return_tensors="pt",
            )
            return {
                "segment": segment,
                "video_frames": video_frames,
                "audio_features": audio_features,
                "text_inputs": text_inputs,
                "segment_path": segment_path,
                "error": None,
            }
        except Exception as e:
            return {"segment": segment, "error": f"prep: {e}", "segment_path": segment_path}

    # All lines are prepared before the model starts. Overlapping the two was
    # measured slower (2026-11-26): the prep threads starve the main thread
    # that feeds the GPU.
    with ThreadPoolExecutor(max_workers=4) as pool:
        prepped = list(pool.map(_prep_segment, result["segments"]))

    for item in prepped:
        segment = item["segment"]
        segment_path = item["segment_path"]
        try:
            if item["error"]:
                print("Segment failed inference: " + item["error"])
                continue

            # Move to device
            text_inputs = {k: v.to(device) for k, v in item["text_inputs"].items()}
            video_frames = item["video_frames"].unsqueeze(0)
            if device.type == "mps":
                # The permuted frame layout crashes Metal's batch norm; a plain
                # copy holds the same values. The CPU path stays as validated.
                video_frames = video_frames.contiguous()
            video_frames = video_frames.to(device)
            audio_features = item["audio_features"].unsqueeze(0).to(device)

            # Get predictions
            with torch.inference_mode():
                outputs = model(text_inputs, video_frames, audio_features)
                emotion_probs = torch.softmax(outputs["emotions"], dim=1)[0]
                sentiment_probs = torch.softmax(
                    outputs["sentiments"], dim=1)[0]

                emotion_values, emotion_indices = torch.topk(emotion_probs, 3)
                sentiment_values, sentiment_indices = torch.topk(
                    sentiment_probs, 3)

            predictions.append({
                "start_time": segment["start"],
                "end_time": segment["end"],
                "text": segment["text"],
                "speaker": _assign_speaker(segment, diarization) if diarization is not None else None,
                "emotions": [
                    {"label": EMOTION_MAP[idx.item()], "confidence": conf.item()} for idx, conf in zip(emotion_indices, emotion_values)
                ],
                "sentiments": [
                    {"label": SENTIMENT_MAP[idx.item()], "confidence": conf.item()} for idx, conf in zip(sentiment_indices, sentiment_values)
                ]
            })

        except Exception as e:
            print("Segment failed inference: " + str(e))

        finally:
            if segment_path and os.path.exists(segment_path):
                os.remove(segment_path)

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
