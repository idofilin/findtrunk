/*
Copyright (C) 2024 Ido Filin. 

This JavaScript code is free software; you can redistribute it
and/or modify it under the terms of the GNU General Public
License as published by the Free Software Foundation; either
version 3 of the License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  
See the GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

import { Context, GLNAME, Shader, Program } from "./kangas.js/context.js"
import { Texture } from "./kangas.js/texture.js"
import * as Transform from "./kangas.js/transforms.js"
import { Renderer } from "./kangas.js/renderer.js"
import { batchLoad, ProgressDisplay } from "./kangas.js/load.js"
import { load as loadCloud, transform as calcTransMat, calcStats, calcSlices, cloudFilenames as cloudList } from "./pointcloud.js"


const canvas = document.querySelector('#app-canvas');
const context = new Context(canvas, {
		alpha:true, 
			onContextLost:(evt)=>{
				const elm = document.createElement("strong");
				elm.style.color = "yellow";
				elm.style.border = "solid red 2px";
				elm.style.display = "block";
				elm.style.textAlign = "center";
				elm.innerHTML = "WebGL context was lost!";
				canvas.before(elm);
				canvas.after(elm.cloneNode(true));
			}
	,
	}, [Shader, Program, Texture, Renderer]);
const gl = context[GLNAME];
const floatRenderExtension = gl.getExtension("EXT_color_buffer_float");

const instructions = document.querySelector('#instructions');

const twopi = Transform.twopi;
const sizeof = Transform.sizeof;

const renderer = new context.Renderer({indexBytesize: sizeof.uint32});

const strideSpeedup = 4;

window.addEventListener("DOMContentLoaded", setupApp, false);

async function setupApp(evt) {
	window.removeEventListener(evt.type, setupApp, false);
	renderer.setDefaultResizer(resizeCanvasCallback);
	let button = document.querySelector('#fullscreen-button');
	button.onclick = () => { canvas.requestFullscreen() };
	button = document.querySelector('#reset-scene');
	button.onclick = ()=>{resetTrunkSceneMat()};
	const fileSelect = document.querySelector("#dataset-select");
	let progressShow = new ProgressDisplay();
	document.body.appendChild(progressShow.htmlElement);
	let shaderPrograms = await loadShaderPrograms(progressShow);
	for (const fname of cloudList) {
		let elem = document.createElement("option");
		elem.setAttribute("value",fname);
		elem.innerHTML=fname;
		fileSelect.appendChild(elem);
	}
	fileSelect.onchange = cloudSelect;

	async function cloudSelect (evt) {
		let cloudname = "https://sci.filin.fi/tls/"+fileSelect.value;
		if (cloudname) {
			renderer.cancelFrameRequest();
			instructions.style.display="none";
			canvas.removeEventListener("pointerdown", touchStartHandler, false);
			canvas.removeEventListener("pointermove", touchMoveHandler, false);
			canvas.removeEventListener("pointerup", touchEndHandler, false);
			canvas.removeEventListener("pointerout", touchEndHandler, false);
			canvas.removeEventListener("pointerleave", touchEndHandler, false);
			canvas.removeEventListener("pointercancel", touchEndHandler, false);
			let cloudData = await loadCloud(cloudname, progressShow);
			initRendering(cloudData, shaderPrograms);
		}
	}
	
}

async function loadShaderPrograms(progress) {
	const urls = new Map([
		["simplepoint.vsh", "pointV" ], 
		["pointcloud.fsh", "pointF"],
		["billboard.vsh", "billboardV"],
		["billboard.fsh", "billboardF"],
		["dbscan.fsh", "clustering"],
		["clustergeometry.fsh", "geostats"],
		["tls.vsh", "tlsVertex"], 
		["tls.fsh", "tlsFragment"],
	]);
	let shaderTexts = await batchLoad( urls, progress, "Loading shaders" );
	let simpleprog = new context.Program(shaderTexts.pointV, shaderTexts.pointF);
	let billboardprog = new context.Program(shaderTexts.billboardV, shaderTexts.billboardF);
	let clusterprog = new context.Program(shaderTexts.billboardV, shaderTexts.clustering);
	let geometryprog = new context.Program(shaderTexts.billboardV, shaderTexts.geostats);
	let tlsprog = new context.Program(shaderTexts.tlsVertex, shaderTexts.tlsFragment);
	return { points: simpleprog , bill: billboardprog, cluster: clusterprog , geomcalc: geometryprog, tls: tlsprog} ;
}

let cloudMeans, cloudSize, cloudMaxes, cloudMins, cloudMids, cloudSlices;
let initialScaler = null;
const zScaler = 7.0;
let sliceIndex = 0, numSlices = 0;
let transMat = null;
const fbosize = 128;
let offscreenFBO = null, offscreenTex = Array(2);
let shaders;
let cleanupIsSet = false;
let deltaZ = 0;
function initRendering (cloud, progs) {

	cloudMeans = cloud.mean;
	cloudSize = cloud.size;
	cloudMins = cloud.min;
	cloudMaxes = cloud.max;
	cloudSlices = calcSlices(cloud.data, 0.1, 3);
	numSlices = cloudSlices.length;
	sliceIndex = 0;
	cloudMids = cloudMaxes.map((x,i)=>(x+cloudMins[i])/2);
	deltaZ = cloudSlices[0].mid
	//let zScaler = 1.99/(cloudSlices[0].max - cloudSlices[0].min);
	initialScaler = 1.0/Math.max(cloudMaxes[0]-cloudMids[0], cloudMaxes[1]-cloudMids[1]);
	transMat = calcTransMat( [ cloudMids[0], cloudMids[1], deltaZ ], initialScaler, zScaler);

	shaders = progs;

	
	const bill_Vertices=new Float32Array([
					 -1.0, -1.0, 0.0, 0.0,
					  1.0, -1.0, 1.0, 0.0,
					  1.0, 1.0, 1.0, 1.0,
					 -1.0, 1.0, 0.0, 1.0,
			]);
	const bill_Indices = new Uint32Array([
				0, 1, 2, 0, 2, 3,
			]);
	renderer.addVertexData("billboard", {
		data: Float32Array.from(bill_Vertices),
		attributes : [{coord:4}],
		bytesize : sizeof.float32,
	});
	renderer.addVertexData("billboardindices", {
		buffertype:"index",
		data: Uint32Array.from(bill_Indices),
		bytesize: sizeof.uint32,
	});

	renderer.addVertexData("cloud", {
		data: cloud.data,
		attributes : [{posCoord:3}],
		bytesize : sizeof.float32,
	});
	renderer.addVertexData("cloudindices", {
		buffertype:"index",
		data: Uint32Array.from({length: cloudSize}, (v,i)=>i),
		bytesize: sizeof.uint32,
	});
	renderer.updateBuffers();
	
	if (!offscreenFBO) {
		let fbo = offscreenFBO = [ gl.createFramebuffer(), gl.createFramebuffer() ];
		fbo[0].height = fbo[0].width = fbosize;
		fbo[1].height = fbo[1].width = fbosize;
		offscreenTex[0] = new context.Texture(fbo[0],
				{filter: gl.NEAREST, wrap: gl.CLAMP_TO_EDGE, format:gl.RGBA, internalformat: gl.RGBA32F, type: gl.FLOAT, attachment: gl.COLOR_ATTACHMENT0});
		offscreenTex[1] = new context.Texture(fbo[1],
			{filter: gl.NEAREST, wrap: gl.CLAMP_TO_EDGE, format:gl.RGBA, internalformat: gl.RGBA32F, type: gl.FLOAT, attachment: gl.COLOR_ATTACHMENT0});
	}

	gl.bindFramebuffer(gl.FRAMEBUFFER, null);
	gl.activeTexture(gl.TEXTURE0);
	gl.bindTexture(gl.TEXTURE_2D, offscreenTex[0][GLNAME]);
	gl.activeTexture(gl.TEXTURE1);
	gl.bindTexture(gl.TEXTURE_2D, offscreenTex[1][GLNAME]);

	gl.useProgram(shaders.points[GLNAME]);
	gl.uniform3f(shaders.points.fixedColor, 1.0, 1.0, 1.0 );

	gl.useProgram(shaders.cluster[GLNAME]);
	gl.uniform1f(shaders.cluster.qstep, 1.0/fbosize);

	gl.useProgram(shaders.geomcalc[GLNAME]);
	gl.uniform1f(shaders.geomcalc.qstep, 1.0/fbosize);

	iterCount = 0;
	cloudCrossSections = [];
	crossSectIndex = 0;
	geometryStage = false;

	gl.viewport(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight);
	gl.frontFace(gl.CCW);
	gl.disable(gl.CULL_FACE);
	gl.depthFunc(gl.LEQUAL);
	gl.disable(gl.DEPTH_TEST);
	gl.blendFunc(gl.ONE_MINUS_DST_ALPHA,gl.DST_ALPHA);
	gl.disable(gl.BLEND);
	gl.clearColor(-1.0, -2.0, -3.0, -4.0);
	gl.clearDepth(1.0);
	gl.clear( gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT );
	gl.flush();

	renderer.animate(clusteringScene);

	if (!cleanupIsSet) {
		console.log("Setup cleanup");
		context.cleanup.push(
			offscreenFBO, 
			offscreenTex, 
			renderer, 
			shaders,	
		);
		cleanupIsSet = true;
	}
}

let iterCount = 0;
let fboIndex = 0;

function clusteringScene(timestamp) {
	const offsets = renderer.vertexData;
	let fbo;
	const mvpMat = transMat;
	let prog;
	const slice = cloudSlices[sliceIndex];
	const sliceSize = slice.endelement - slice.startelement;
	const sliceByteoffset = slice.startelement*offsets.cloudindices.bytesize;
	
	if (iterCount == 0) {
		fboIndex = 0;
		fbo = offscreenFBO[fboIndex];
		gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
		gl.viewport (0.0, 0.0, fbo.width, fbo.height);
		prog = shaders.points;
		gl.useProgram(prog[GLNAME]);
		gl.uniformMatrix4fv(prog.MVPmatrix, false, mvpMat);
		gl.uniform1f(prog.pointSize, 1.0);
		gl.uniform1f(prog.fixedcolorFactor, 0.0);
		gl.clear(gl.COLOR_BUFFER_BIT);
		bindAttributePointer(prog.posCoord, offsets.cloud, offsets.cloud.posCoord)		
		gl.drawElements(gl.POINTS, sliceSize, gl.UNSIGNED_INT, offsets.cloudindices.byteoffset + sliceByteoffset);
	}

	prog = shaders.cluster;
	gl.useProgram(prog[GLNAME]);
	bindAttributePointer(prog.coord, offsets.billboard, offsets.billboard.coord);
	for (let speedup = 128; speedup > 0; speedup--) {
		let texIndex = fboIndex;
		fboIndex = parseInt(1 - fboIndex);
		fbo = offscreenFBO[fboIndex];
		gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
		gl.viewport (0.0, 0.0, fbo.width, fbo.height);
		gl.uniform1i(prog.occupancy, texIndex);
		gl.clear(gl.COLOR_BUFFER_BIT);
		gl.drawElements(gl.TRIANGLES, offsets.billboardindices.data.length, gl.UNSIGNED_INT, offsets.billboardindices.byteoffset);
		iterCount++;
	}
	
	prog = shaders.bill;
	gl.useProgram(shaders.bill[GLNAME]);
	gl.bindFramebuffer(gl.FRAMEBUFFER, null);
	gl.viewport (0.0, 0.0, gl.drawingBufferWidth, gl.drawingBufferHeight);
	gl.clear( gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT );
	gl.uniform1i(prog.densityTex, fboIndex);
	gl.drawElements(gl.TRIANGLES, offsets.billboardindices.data.length, gl.UNSIGNED_INT, offsets.billboardindices.byteoffset);
	
	prog = shaders.points;
	gl.useProgram(prog[GLNAME]);
	gl.uniform1f(prog.pointSize, 1.0);
	gl.uniform1f(prog.fixedcolorFactor, 1.0);
	bindAttributePointer(prog.posCoord, 
		offsets.cloud, offsets.cloud.posCoord, strideSpeedup);
	gl.drawElements(gl.POINTS, Math.floor(sliceSize/strideSpeedup), gl.UNSIGNED_INT, offsets.cloudindices.byteoffset + Math.floor(slice.startelement/strideSpeedup)*sizeof.uint32);
	if (iterCount < fbosize) 
		renderer.animate(clusteringScene);
	else if (!geometryStage) {
		calcInitialClusters();	
	} else if (geometryStage) {
	}
}

let cloudCrossSections = [];
let geometryStage = false;
let clusterCounter = 0;
const pixels = new Float32Array(fbosize*fbosize*4);

function calcInitialClusters () {
	const fbo = offscreenFBO[fboIndex];
	const w = fbo.width, h = fbo.height;
	gl.flush();
	gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
	gl.readPixels(0, 0, fbo.width, fbo.height, gl.RGBA, gl.FLOAT, pixels);
	if (cloudCrossSections.length === 0)
		clusterCounter = 0;

	let clusterMap = Int32Array.from(pixels.filter((x,i)=>i%4===3));
	let clusterIDs = new Set ( clusterMap.filter( (x)=>x>0 ) );
	for (const cid of clusterIDs) {
		let xMinMax = clusterMap.reduce( (acc,x,i)=>{
				if (x===cid) {
					const val=i%w; 
					acc[0]=Math.min(acc[0],val); 
					acc[1]=Math.max(acc[1],val) 
				}; 
				return acc
			} ,[+Infinity, -Infinity]);
		let yMinMax = clusterMap.reduce( (acc,x,i)=>{
				if (x === cid) {
					const val=Math.floor(i/w); 
					acc[0]=Math.min(acc[0],val); 
					acc[1]=Math.max(acc[1],val)
				}; 
				return acc
			} ,[+Infinity, -Infinity]);
		let xRange = xMinMax.map((x,i)=>(2*(x+i)-fbo.width)/fbo.width);
		let yRange = yMinMax.map((y,i)=>(2*(y+i)-fbo.height)/fbo.height);
		clusterCounter++;
		cloudCrossSections.push({
			idValue: cid,
			slice: sliceIndex,
			deltaz: deltaZ,
			xrange: xRange, 
			yrange: yRange, 
			center: [(xRange[0]+xRange[1])/2, (yRange[0]+yRange[1])/2],
			numClusters: clusterIDs.size,
			baseScaler: 2.0/Math.max(
				(cloudMaxes[0]-cloudMids[0])*(xRange[1]-xRange[0]),
				(cloudMaxes[1]-cloudMids[1])*(yRange[1]-yRange[0])),
		});
	}
	sliceIndex++;
	if (sliceIndex >= numSlices) {
		console.log("Total number of clusters: " + cloudCrossSections.length);
		crossSectIndex = 0;
		trunkData = [];
		geometryStage = true;
		perClusterAnalysis();
		return;
	} else {
		deltaZ = cloudSlices[sliceIndex].mid;
		transMat = calcTransMat([cloudMids[0], cloudMids[1], deltaZ], initialScaler, zScaler);
		iterCount = 0;
		renderer.animate(clusteringScene);
	}
}

let crossSectIndex = 0;
let trunkData = [];
function perClusterAnalysis() {
	const maxCrossSectionIndex = cloudCrossSections.length - 1;
	while (crossSectIndex <= maxCrossSectionIndex 
			&& cloudCrossSections[crossSectIndex].numClusters > 1)
		crossSectIndex++;
	if (crossSectIndex > maxCrossSectionIndex) {
		drawTrunk();
		return;
	}
	crossSectIndex = (crossSectIndex < 0)? 0 : crossSectIndex;
	crossSectIndex = (crossSectIndex > maxCrossSectionIndex)? maxCrossSectionIndex : crossSectIndex;
	const cSect = cloudCrossSections[crossSectIndex];

	deltaZ = cSect.deltaz;
	sliceIndex = cSect.slice;
	let centerX = cloudMids[0] + cSect.center[0]/initialScaler; 
	let centerY = cloudMids[1] + cSect.center[1]/initialScaler; 
	//console.log(`${cSect.numClusters} cluster(s), ${cloudMids[0]}  --> ${centerX}, ${cloudMids[1]} --> ${centerY}`);

	transMat = calcTransMat([centerX, centerY, deltaZ], cSect.baseScaler, zScaler);

	renderer.animate(geometryScene);
}

function geometryScene(timestamp) {
	const offsets = renderer.vertexData;
	const mvpMat = transMat;
	let fbo;
	let prog;
	const slice = cloudSlices[sliceIndex];
	const sliceSize = Math.floor((slice.endelement - slice.startelement)/strideSpeedup);
	const sliceByteoffset = Math.floor(slice.startelement/strideSpeedup)*offsets.cloudindices.bytesize;

	bindfbo(0);
	bindprog(shaders.points);
	gl.uniformMatrix4fv(prog.MVPmatrix, false, mvpMat);
	gl.uniform1f(prog.pointSize, 1.0);
	gl.uniform1f(prog.fixedcolorFactor, 0.0);
	gl.clear(gl.COLOR_BUFFER_BIT);
	bindAttributePointer(prog.posCoord, 
		offsets.cloud, offsets.cloud.posCoord, strideSpeedup);
	gl.drawElements(gl.POINTS, sliceSize, gl.UNSIGNED_INT, offsets.cloudindices.byteoffset + sliceByteoffset);

	bindfbo(1);
	bindprog(shaders.cluster);
	bindAttributePointer(prog.coord, 
		offsets.billboard, offsets.billboard.coord);
	gl.uniform1i(prog.occupancy, 0);
	gl.clear(gl.COLOR_BUFFER_BIT);
	gl.drawElements(gl.TRIANGLES, offsets.billboardindices.data.length, gl.UNSIGNED_INT, offsets.billboardindices.byteoffset);

	bindfbo(0);
	bindprog(shaders.geomcalc);
	gl.uniform1i(prog.occupancy, 1);
	gl.clear(gl.COLOR_BUFFER_BIT);
	bindAttributePointer(prog.coord, 
		offsets.billboard, offsets.billboard.coord);
	gl.drawElements(gl.TRIANGLES, offsets.billboardindices.data.length, gl.UNSIGNED_INT, offsets.billboardindices.byteoffset);

    const speedup = 2;
	if (crossSectIndex % speedup ===0) {
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		gl.viewport (0.0, 0.0, gl.drawingBufferWidth, gl.drawingBufferHeight);
		gl.clear( gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT );
		bindprog(shaders.bill);
		gl.uniform1i(prog.densityTex, 0);
		gl.drawElements(gl.TRIANGLES, offsets.billboardindices.data.length, gl.UNSIGNED_INT, offsets.billboardindices.byteoffset);
		
		bindprog(shaders.points);
		gl.uniform1f(prog.pointSize, 2.0);
		gl.uniform1f(prog.fixedcolorFactor, 1.0);
		bindAttributePointer(prog.posCoord, 
			offsets.cloud, offsets.cloud.posCoord, strideSpeedup);
		gl.drawElements(gl.POINTS, sliceSize, gl.UNSIGNED_INT, offsets.cloudindices.byteoffset + sliceByteoffset);
	}

	gl.flush();
	gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
	gl.readPixels(0, 0, fbo.width, fbo.height, gl.RGBA, gl.FLOAT, pixels);
	const clusterPixels = pixels.filter((x,i,a)=>a[i-i%4+3]>0);
	const [ centerX, centerY ] = [ clusterPixels[1], clusterPixels[2] ];
	const distances = clusterPixels.filter((x,i,a)=>i%4===0);
	trunkData.push(Object.assign(
		{centerCorrect: [centerX, centerY], distStats: calcStats(distances) },
		cloudCrossSections[crossSectIndex]));

	crossSectIndex++;
	perClusterAnalysis();

	function bindfbo(bufind) {
		fbo = offscreenFBO[bufind];
		gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
		gl.viewport (0.0, 0.0, fbo.width, fbo.height);
	}

	function bindprog (p) {
		prog = p;
		gl.useProgram(prog[GLNAME]);
	}
}

const numCircleCoords=24;
const circleCoords = Float32Array.from({length: numCircleCoords*3}, (v,i)=>{
		let angle = (2*Math.PI/numCircleCoords)*Math.floor(i/3);
		return (i%3 == 0) && Math.cos(angle) || (i%3 == 1) && Math.sin(angle) || 0;
	}
); 

let trunkSceneZoomFactor, trunkSceneOffset;
function drawTrunk() {
	let index = 0, 
		trunkCoords = [],
		ringsCoords = [];
	while (index < trunkData.length) {
		const cSect = trunkData[index];
		let centerX = cloudMids[0] 
			+ cSect.center[0]/initialScaler 
			+ cSect.centerCorrect[0]/cSect.baseScaler; 
		let centerY = cloudMids[1] 
			+ cSect.center[1]/initialScaler
			+ cSect.centerCorrect[1]/cSect.baseScaler; 
		if (cSect.numClusters === 1) {
			trunkCoords.push(centerX);
			trunkCoords.push(centerY);
			trunkCoords.push(cSect.deltaz);
			let radius = cSect.distStats.mean[0]/cSect.baseScaler;
			ringsCoords.push(...(
				circleCoords.map( (x,i)=>
					(i%3===0) && (radius*x+centerX) || (i%3===1) && (radius*x+centerY) || cSect.deltaz )
			));
		}
		index++;
	}
	renderer.addVertexData("trunk", {
		data: Float32Array.from(trunkCoords),
		attributes : [{posCoord:3}],
		bytesize : sizeof.float32,
	});
	renderer.addVertexData("trunkindices", {
		buffertype:"index",
		data: Uint32Array.from({length: trunkCoords.length/3}, (v,i)=>i),
		bytesize: sizeof.uint32,
	});
	renderer.addVertexData("rings", {
		data: Float32Array.from(ringsCoords),
		attributes : [{posCoord:3}],
		bytesize : sizeof.float32,
	});
	renderer.addVertexData("ringsindices", {
		buffertype:"index",
		data: Uint32Array.from({length: ringsCoords.length/3}, (v,i)=>i),
		bytesize: sizeof.uint32,
	});

	renderer.updateBuffers();
	const offsets = renderer.vertexData;

	gl.bindFramebuffer(gl.FRAMEBUFFER, null);
	gl.viewport (0.0, 0.0, gl.drawingBufferWidth, gl.drawingBufferHeight);
	gl.frontFace(gl.CCW);
	gl.enable(gl.CULL_FACE);
	gl.depthFunc(gl.LEQUAL);
	gl.blendFunc(gl.ONE_MINUS_DST_ALPHA,gl.DST_ALPHA);
	gl.disable(gl.DEPTH_TEST);
	gl.clearColor(0.0, 0.0, 0.0, 1.0);
	gl.clearDepth(1.0);
	gl.clear(gl.COLOR_BUFFER_BIT);

	let program=shaders.points;
	gl.useProgram(program[GLNAME]);
	gl.uniform1f(program.fixedcolorFactor, 1.0);
	gl.uniform1f(program.pointSize, 3.0);

	resetTrunkSceneMat();

	renderer.animate(trunkScene);

	canvas.addEventListener("pointerdown",touchStartHandler, false);
	instructions.style.display="block";
	
	return;
}

function trunkScene(timestamp) {
	let program=shaders.tls;

	gl.useProgram(program[GLNAME]);
	const rotMat = Transform.translationYawPitchRoll( 
		[0.0, 0.0, 0.0], 
		[0.0001*Math.PI*timestamp, 0.0001*Math.E*timestamp, 0.0001*Math.SQRT2*timestamp] );
	const mvpMat = Transform.matProd(rotMat,transMat);
	gl.uniformMatrix4fv(program.MVPmatrix, false, mvpMat);

	const offsets = renderer.vertexData;
	gl.clear( gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT );
	bindAttributePointer(program.posCoord, 
		offsets.cloud, offsets.cloud.posCoord, strideSpeedup);
	gl.drawElements(gl.POINTS, Math.floor(cloudSize/strideSpeedup), gl.UNSIGNED_INT, offsets.cloudindices.byteoffset);

	program = shaders.points;
	gl.useProgram(program[GLNAME]);
	gl.uniformMatrix4fv(program.MVPmatrix, false, mvpMat);
	gl.uniform3f(program.fixedColor, 0.0, 1.0, 0.0 );
	bindAttributePointer(program.posCoord, 
		offsets.trunk, offsets.trunk.posCoord);
	gl.drawElements(gl.POINTS, offsets.trunkindices.data.length, gl.UNSIGNED_INT, offsets.trunkindices.byteoffset);
	gl.drawElements(gl.LINE_STRIP, offsets.trunkindices.data.length, gl.UNSIGNED_INT, offsets.trunkindices.byteoffset);

	gl.uniform3f(program.fixedColor, 1.0, 1.0, 0.0 );
	bindAttributePointer(program.posCoord, 
		offsets.rings, offsets.rings.posCoord);
	gl.drawElements(gl.LINE_STRIP, offsets.ringsindices.data.length, gl.UNSIGNED_INT, offsets.ringsindices.byteoffset);

	renderer.animate(trunkScene);
}

function resizeCanvasCallback (e, projection) {
	//console.log("Resize event placeholder handler.");
}

function bindAttributePointer(attribHandle, buffer, bufferHandle, stride=1) {
	gl.vertexAttribPointer(attribHandle, 
		bufferHandle.size, gl.FLOAT, false, 
		stride * buffer.bytestride, 
		bufferHandle.byteoffset);
}

let activeTouches = new Set();
let starttouchx=null, starttouchy = null;
function touchStartHandler (evt) {
	evt.stopPropagation();
	evt.preventDefault();
	if (activeTouches.size == 0) {
		canvas.addEventListener("pointermove", touchMoveHandler, false);
		canvas.addEventListener("pointerup", touchEndHandler, false);
		canvas.addEventListener("pointerout", touchEndHandler, false);
		canvas.addEventListener("pointerleave", touchEndHandler, false);
		canvas.addEventListener("pointercancel", touchEndHandler, false);
	}
	activeTouches.add(evt.pointerId);
	if (evt.isPrimary) {
		starttouchx = evt.x; 
		starttouchy = evt.y;
	}
}

function touchEndHandler (evt) {
	activeTouches.delete(evt.pointerId);
	evt.stopPropagation();
	evt.preventDefault();
	if (activeTouches.size == 0) {
		canvas.removeEventListener("pointermove", touchMoveHandler, false);
		canvas.removeEventListener("pointerup", touchEndHandler, false);
		canvas.removeEventListener("pointerout", touchEndHandler, false);
		canvas.removeEventListener("pointerleave", touchEndHandler, false);
		canvas.removeEventListener("pointercancel", touchEndHandler, false);
	}
	if (evt.isPrimary) {
		trunkSceneZoomFactor *= Math.exp(-(evt.y-starttouchy)/canvas.clientHeight)
		trunkSceneOffset += (evt.x-starttouchx)/canvas.clientWidth * 0.1*(cloudMaxes[2]-cloudMins[2]), 
		calcTrunkSceneMat(trunkSceneOffset, trunkSceneZoomFactor);
	}
}

function touchMoveHandler (evt) {
	activeTouches.add(evt.pointerId);
	evt.stopPropagation();
	evt.preventDefault();
	if (evt.isPrimary) {
		calcTrunkSceneMat(
			trunkSceneOffset + (evt.x-starttouchx)/canvas.clientWidth * 0.1*(cloudMaxes[2]-cloudMins[2]), 
			trunkSceneZoomFactor * Math.exp(-(evt.y-starttouchy)/canvas.clientHeight)
		);
	}
}

function calcTrunkSceneMat (deltaz, zoomfactor) {
	transMat = calcTransMat( [ cloudMids[0], cloudMids[1], cloudMids[2]+deltaz ], initialScaler*zoomfactor);
}

function resetTrunkSceneMat () {
	trunkSceneOffset = 0.0;
	trunkSceneZoomFactor = 0.33;
	calcTrunkSceneMat(trunkSceneOffset, trunkSceneZoomFactor);
}

