import {parseSii} from './packages/clis/parser/game-files/sii-parser.ts';

const sample = `SiiNunit
{
  /*
    The main purpose is to speed up omitting 'model.sii' to SVN
    This def is an explanatory comment, not an SII unit.
  */
  city_data : .test {
    name: "Example"
  }
}`;

const result = parseSii(sample);
if (!result.ok) {
  console.error(result.lexErrors, result.parseErrors);
  throw new Error('SII block-comment parsing failed');
}
console.log('SII block-comment parsing works');
