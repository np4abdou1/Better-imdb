
/**
 * Converts SRT subtitle content to WebVTT format.
 * Adapted from Stremio's stremio-video/src/withHTMLSubtitles/subtitlesConverter.js
 */

export function srt2webvtt(data: string): string {
  // remove dos newlines
  let srt = data.replace(/\r+/g, '');
  // trim white space start and end
  srt = srt.replace(/^\s+|\s+$/g, '');
  
  // get cues
  const cuelist = srt.split('\n\n');
  let result = '';
  
  if (cuelist.length > 0) {
    result += 'WEBVTT\n\n';
    for (let i = 0; i < cuelist.length; i = i + 1) {
      result += convertSrtCue(cuelist[i]);
    }
  }
  return result;
}

function convertSrtCue(caption: string): string {
  // remove all html tags for security reasons
  let cleanCaption = caption.replace(/<[a-zA-Z/][^>]*>/g, '');

  let cue = '';
  const s = cleanCaption.split(/\n/);
  
  // concatenate multi-line string separated in array into one
  while (s.length > 3) {
      for (let i = 3; i < s.length; i++) {
          s[2] += '\n' + s[i];
      }
      s.splice(3, s.length - 3);
  }
  
  let line = 0;
  
  // detect identifier (if present)
  // Check if first line is a number and second is timestamp
  if (s[0] && s[1] && !s[0].match(/\d+:\d+:\d+/) && s[1].match(/\d+:\d+:\d+/)) {
      // s[0] is index, skip it or keep it? WebVTT doesn't strictly need it, but we can keep it as identifier
      // cue += s[0] + '\n'; 
      line += 1;
  }
  
  // get time strings
  if (s[line] && s[line].match(/\d+:\d+:\d+/)) {
      // convert time string from 00:00:00,000 to 00:00:00.000
      const m = s[line].match(/(\d+):(\d+):(\d+)(?:,(\d+))?\s*--?>\s*(\d+):(\d+):(\d+)(?:,(\d+))?/);
      if (m) {
          cue += m[1] + ':' + m[2] + ':' + m[3] + '.' + (m[4] || '000') + ' --> '
              + m[5] + ':' + m[6] + ':' + m[7] + '.' + (m[8] || '000') + '\n';
          line += 1;
      } else {
          // Unrecognized timestring
          return '';
      }
  } else {
      // file format error or comment lines
      return '';
  }
  
  // get cue text
  if (s[line]) {
      cue += s[line] + '\n\n';
  }
  
  return cue;
}

export function convertSubtitles(text: string): string {
    // presume all to be SRT if not WEBVTT
    if (text.includes('WEBVTT')) {
        return text;
    }

    try {
        return srt2webvtt(text);
    } catch (error: any) {
        console.error('Failed to convert srt to webvtt', error);
        throw new Error('Failed to convert srt to webvtt: ' + error.message);
    }
}
