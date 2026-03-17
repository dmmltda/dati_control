import ffmpeg from 'ffmpeg-static';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

const input = path.join(process.cwd(), 'assets', '8a0a057e30bcb67d5c00e9ba15ef2e61.webm'); // I'll search for the right dynamically generated file. Wait, in assets there's already `video_tooltip_nome.webm`.
const inputWebm = path.join(process.cwd(), 'assets', 'video_tooltip_nome.webm');
const outputBase = path.join(process.cwd(), 'assets', 'video_tooltip_');

console.log('Using ffmpeg path:', ffmpeg);

const targetNames = [
    'main', 
    'nome',
    'status',
    'saude',
    'nps',
    'proximo',
    'produtos',
    'segmento',
    'act-import',
    'act-edit',
    'act-delete',
    'act-clear'
];

for(const name of targetNames) {
   const output = outputBase + name + '.mp4';
   try {
       fs.unlinkSync(output); // remove if exists
   }catch(e){}
   
   console.log('Converting to', output);
   execSync(`"${ffmpeg}" -i "${inputWebm}" -c:v libx264 -pix_fmt yuv420p -profile:v main -level 3.1 -an "${output}"`, { stdio: 'inherit' });
}

console.log('Done!');
