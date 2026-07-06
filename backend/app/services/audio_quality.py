from __future__ import annotations

from dataclasses import dataclass
import json
import math
from pathlib import Path
import wave

from app.schemas.audio_journal import AudioQualityMetrics


@dataclass
class DecodedWav:
    samples: list[float]
    sample_rate: int
    channels: int
    frame_count: int


class AudioQualityAnalyzer:
    """First-pass heuristic analyzer, not a professional audio measurement tool."""

    def analyze(self, audio_path: Path, *, has_training_text: bool = False) -> AudioQualityMetrics:
        suffix = audio_path.suffix.lower().lstrip(".")
        if suffix != "wav":
            return AudioQualityMetrics(
                file_format=suffix or None,
                quality_status="review",
                quality_score=40,
                quality_summary="Quality analysis is currently heuristic and only measures WAV files fully.",
                quality_reasons_json=json.dumps(["non_wav_analysis_limited"]),
            )

        try:
            decoded = self._decode_wav(audio_path)
        except (wave.Error, EOFError, ValueError) as error:
            return AudioQualityMetrics(
                file_format="wav",
                quality_status="rejected",
                quality_score=0,
                quality_summary=f"Could not analyze WAV audio: {error}",
                quality_reasons_json=json.dumps(["wav_decode_failed"]),
            )

        duration = decoded.frame_count / decoded.sample_rate if decoded.sample_rate else 0
        peak = max((abs(sample) for sample in decoded.samples), default=0.0)
        rms = math.sqrt(sum(sample * sample for sample in decoded.samples) / len(decoded.samples)) if decoded.samples else 0
        peak_db = self._dbfs(peak)
        rms_db = self._dbfs(rms)
        silence_ratio = self._silence_ratio(decoded.samples)
        noise_floor = self._noise_floor_db(decoded.samples)
        snr = None if noise_floor is None or rms_db is None else round(rms_db - noise_floor, 2)
        clipping_detected = peak >= 0.999

        reasons: list[str] = []
        status = "usable"
        score = 100.0

        if duration < 5:
            status = "review"
            score -= 25
            reasons.append("duration_under_5_seconds")
        elif duration > 120:
            status = "review"
            score -= 10
            reasons.append("duration_over_120_seconds")

        if clipping_detected:
            status = "rejected"
            score -= 60
            reasons.append("clipping_detected")

        if rms_db is None or rms_db < -45:
            if status != "rejected":
                status = "review"
            score -= 20
            reasons.append("rms_too_low")

        if peak_db is None or peak_db < -35:
            if status != "rejected":
                status = "review"
            score -= 10
            reasons.append("peak_too_low")

        if silence_ratio > 0.35:
            if status != "rejected":
                status = "review"
            score -= 15
            reasons.append("high_silence_ratio")

        if not has_training_text:
            score -= 5
            reasons.append("transcript_or_script_missing")

        score = max(0.0, min(100.0, round(score, 2)))
        if not reasons:
            summary = "WAV quality looks usable for a first-pass local dataset review."
        elif status == "rejected":
            summary = "WAV quality has a major issue and should not be used for training without review."
        else:
            summary = "WAV quality needs review before being treated as training-ready."

        return AudioQualityMetrics(
            duration_seconds=round(duration, 3),
            sample_rate=decoded.sample_rate,
            channels=decoded.channels,
            file_format="wav",
            quality_status=status,
            quality_score=score,
            quality_summary=summary,
            quality_reasons_json=json.dumps(reasons),
            noise_floor_db=noise_floor,
            rms_db=rms_db,
            peak_db=peak_db,
            clipping_detected=clipping_detected,
            silence_ratio=round(silence_ratio, 4),
            snr_estimate_db=snr,
        )

    def _decode_wav(self, audio_path: Path) -> DecodedWav:
        with wave.open(str(audio_path), "rb") as wav_file:
            channels = wav_file.getnchannels()
            sample_rate = wav_file.getframerate()
            sample_width = wav_file.getsampwidth()
            frame_count = wav_file.getnframes()
            raw = wav_file.readframes(frame_count)

        if sample_width not in {1, 2, 4}:
            raise ValueError(f"unsupported sample width: {sample_width}")

        samples: list[float] = []
        step = sample_width
        for index in range(0, len(raw), step):
            chunk = raw[index : index + step]
            if len(chunk) < step:
                continue
            if sample_width == 1:
                value = chunk[0] - 128
                samples.append(value / 128)
            elif sample_width == 2:
                value = int.from_bytes(chunk, byteorder="little", signed=True)
                samples.append(value / 32768)
            else:
                value = int.from_bytes(chunk, byteorder="little", signed=True)
                samples.append(value / 2147483648)

        return DecodedWav(
            samples=samples,
            sample_rate=sample_rate,
            channels=channels,
            frame_count=frame_count,
        )

    def _silence_ratio(self, samples: list[float]) -> float:
        if not samples:
            return 1.0
        silent_count = sum(1 for sample in samples if abs(sample) < 0.01)
        return silent_count / len(samples)

    def _noise_floor_db(self, samples: list[float]) -> float | None:
        if not samples:
            return None
        magnitudes = sorted(abs(sample) for sample in samples if abs(sample) > 0)
        if not magnitudes:
            return None
        index = max(0, min(len(magnitudes) - 1, int(len(magnitudes) * 0.1)))
        return self._dbfs(magnitudes[index])

    def _dbfs(self, value: float) -> float | None:
        if value <= 0:
            return None
        return round(20 * math.log10(value), 2)
