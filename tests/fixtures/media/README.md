# Multimedia verification fixtures

Audio and video samples are generated at test runtime with FFmpeg in the operating system's temporary directory; binary media is not stored in the repository. The generated audio uses synthetic tones, and the short video samples use simple color frames with synthetic audio. The VTT files are text fixtures kept alongside this README.

| Sample | Prompt | Choices and text alternatives |
|---|---|---|
| Spoken arithmetic | “What is two plus two?” | Four generated audio files with “Two,” “Four,” “Six,” and “Eight” as transcripts |
| Match a hand motion | “Which option repeats the same hand-motion sequence as the prompt?” | Five generated video files; the test validates the text alternatives and media workflow |

The media test suite requires FFmpeg and FFprobe. See [the media implementation and sample preview commands](../../../docs/enterprise-upgrade/20-accessible-media-worklog.md).
