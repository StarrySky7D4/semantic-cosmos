import {spawn} from 'node:child_process';
// A synchronous cycle can block node:test's in-process timer. Run the tests in
// exactly one child (no isolation workers), with an independent hard deadline.
const probe=process.argv.includes('--watchdog-probe'),args=probe?['-e',"console.log('START intentional synchronous watchdog probe');for(;;){}"]:['--test','--test-isolation=none','--test-reporter=spec','--test-timeout=10000','tests/core.test.mjs','tests/hierarchy.test.mjs','tests/orbits.test.mjs','tests/scene.test.mjs','tests/sources.test.mjs','tests/local-import.test.mjs','tests/ingestion-watchdog.test.mjs'];
const child=spawn(process.execPath,args,{stdio:['ignore','pipe','pipe']});let last='starting',timedOut=false;
console.log('Unit test PID '+child.pid+' · '+args.join(' '));
child.stdout.on('data',data=>{const text=data.toString();process.stdout.write(text);const starts=text.split(/\r?\n/).filter(x=>x.startsWith('START '));if(starts.length)last=starts.at(-1);});child.stderr.pipe(process.stderr);
const deadlineMs=probe?200:30000,deadline=setTimeout(()=>{timedOut=true;console.error('Test watchdog exceeded '+deadlineMs+' ms; terminating only unit-test PID '+child.pid+'; last test: '+last);child.kill('SIGKILL');process.exitCode=1;},deadlineMs);
child.on('error',error=>{clearTimeout(deadline);console.error(error);process.exitCode=1;});child.on('close',code=>{clearTimeout(deadline);process.exitCode=probe&&timedOut?0:code??1;if(probe&&timedOut)console.log('PASS: watchdog stopped its own blocked child.');});
