// Release art contract: all 110 identities, actual four-direction frame progression.
// Keep the historic CLI entry point; W10 now walks and W11 uses new directional art.
const args=process.argv.slice(2), positional=args.filter(x=>!x.startsWith('--'));
if(positional.length>1)throw new Error('Usage: node inf-art-check.js [maxWave=101] [--phone] [--pilot]');
if(positional[0]){
 const max=Number(positional[0]);
 if(!Number.isInteger(max)||max<1||max>101)throw new Error('maxWave must be 1..101');
 process.argv=process.argv.filter((x,i)=>i<2||x!==positional[0]);
 process.argv.push('--max-wave='+max);
}
require('./directional-real-art.cjs');
