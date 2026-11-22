// Every page the site builds, with what its head, header and footer need:
// the authored pages from src/pages.yaml, then one page per answer.
import {parse} from 'yaml';
import authored from './pages.yaml?raw';
import answers from '../.generated/answer-pages.json';

export const pages = [
  ...Object.entries(parse(authored)).map(([name, meta]) => ({name, ...meta})),
  ...answers,
].map(page => ({lang: 'en', ...page}));
