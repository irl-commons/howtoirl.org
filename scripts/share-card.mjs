// What a share image was made from, kept in the PNG itself (a tEXt chunk): the card's hash from .generated/share.json
// (scripts/share.py), so the tests can tell an image that no longer matches its page from a current one. Used by
// scripts/share-images.mjs and scripts/check.test.mjs.
import {crc32} from 'node:zlib';

const KEY='howtoirl-card';

function* chunks(png){
 for(let at=8;at<png.length;){const size=png.readUInt32BE(at);yield {at,type:png.toString('latin1',at+4,at+8),data:png.subarray(at+8,at+8+size),end:at+12+size};at+=12+size;}
}
export const pngSize=png=>[png.readUInt32BE(16),png.readUInt32BE(20)];
export function readCard(png){
 for(const c of chunks(png))if(c.type==='tEXt'&&c.data.toString('latin1').startsWith(KEY+'\0'))return c.data.toString('latin1').slice(KEY.length+1);
 return null;
}
export function writeCard(png,hash){
 const iend=[...chunks(png)].find(c=>c.type==='IEND').at;
 const body=Buffer.concat([Buffer.from('tEXt'),Buffer.from(`${KEY}\0${hash}`,'latin1')]);
 const len=Buffer.alloc(4);len.writeUInt32BE(body.length-4);
 const crc=Buffer.alloc(4);crc.writeUInt32BE(crc32(body));
 return Buffer.concat([png.subarray(0,iend),len,body,crc,png.subarray(iend)]);
}
