import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
mkdirSync('public/wasm',{recursive:true});
const compiler=process.env.COSMOS_RUSTC||'rustc';
const result=spawnSync(compiler,['--edition=2021','--target','wasm32-unknown-unknown','--crate-type','cdylib','-C','opt-level=3','-C','panic=abort','-C','strip=symbols','wasm-core/src/lib.rs','-o','public/wasm/cosmos_core.wasm'],{stdio:'inherit'});
if(result.error)throw new Error('Rust 编译器未找到；安装 rustup 并添加 wasm32-unknown-unknown target，或使用已提供的构建产物。');
if(result.status!==0)process.exit(result.status||1);
