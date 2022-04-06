module.exports = Object.freeze({
    SEGMENT_LENGTH: 15000, // how long should each video chunk be (ms). they are concatenated when recording stops.
    DIR_NAMES: {
        unprocessed_chunks: 'unprocessed_chunks',
        processed_chunks: 'processed_chunks',
        session_videos: 'session_videos',
        color: 'color',
        depth: 'depth',
        pose: 'pose'
    },
    COLOR_FILETYPE: 'mp4',
    DEPTH_FILETYPE: 'mp4', // previously tried webm and mkv for lossless encoding but it never quite worked
    RESCALE_VIDEOS: false, // disable to prevent lossy transformation, enable to stretch videos back to correct time length (otherwise video playback system can adjust for this)
    DEBUG_WRITE_IMAGES: false, // write each color and depth frame to an image file while recording, useful for debugging if ffmpeg isn't working
});
