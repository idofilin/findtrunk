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

import { Context, GLNAME, Shader, Program } from "./poikilo.js"
import { Texture } from "./poikilo-texture.js"
import * as Transform from "./poikilo-transforms.js"
import { Renderer } from "./poikilo-renderer.js"
import { batchLoad, ProgressDisplay } from "./poikilo-load.js"
import { load as loadCloud, transform as calcTransMat, calcStats, cloudFilenames as cloudList } from "./pointcloud.js"

const canvas = document.getElementById('app-canvas');
const context = new Context(canvas, {alpha:true}, [Shader, Program, Texture, Renderer]);
const gl = context[GLNAME];
const floatRenderExtension = gl.getExtension("EXT_color_buffer_float");

const twopi = Transform.twopi;
const sizeof = Transform.sizeof;

const renderer = new context.Renderer({indexBytesize: sizeof.uint32});

window.addEventListener("DOMContentLoaded", setupApp, false);

async function setupApp(evt) {
	window.removeEventListener(evt.type, setupApp, false);
	renderer.setDefaultResizer(resizeCanvasCallback);
	const button = document.getElementById('fullscreen-button');
	button.onclick = ()=>{canvas.requestFullscreen(canvas)};
	const fileSelect = document.getElementById("dataset-select");
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
		let cloudname = fileSelect.value;
		if (cloudname) {
			renderer.cancelFrameRequest();
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

let cloudMeans, cloudSize, cloudMaxes, cloudMins, cloudMids;
let initialScaler = null;
const zScaler = 7.0;
let deltaZ = null;
let transMat = null;
const fbosize = 128;
let offscreenFBO = null, offscreenTex = null;
let shaders;
let cleanupIsSet = false;
function initRendering (cloud, progs) {

	cloudMeans = cloud.mean;
	cloudSize = cloud.size;
	cloudMins = cloud.min;
	cloudMaxes = cloud.max;
	cloudMids = cloudMaxes.map((x,i)=>(x+cloudMins[i])/2);
	deltaZ = cloudMins[2];
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
		let tex = offscreenTex = [ gl.createTexture(), gl.createTexture(), gl.createTexture(), gl.createTexture() ];
		gl.activeTexture(gl.TEXTURE0);
		const attachment = [ gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1 ];
		const texTarget = gl.TEXTURE_2D;
		for (let i=0; i<4; i++) {
			let currFBO = fbo[i%2]; 
			gl.bindFramebuffer(gl.FRAMEBUFFER, currFBO);
			gl.bindTexture(gl.TEXTURE_2D,tex[i]);
			gl.texImage2D(texTarget, 0, gl.RGBA32F, 
					currFBO.width, currFBO.height, 0, gl.RGBA, gl.FLOAT, null);
			gl.texParameteri(texTarget, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
			gl.texParameteri(texTarget, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
			gl.texParameteri(texTarget, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
			gl.texParameteri(texTarget, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
			gl.texParameteri(texTarget, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
			gl.framebufferTexture2D(gl.FRAMEBUFFER, attachment[Math.floor(i/2)], gl.TEXTURE_2D, offscreenTex[i], 0);
		}
	}

	gl.bindRenderbuffer(gl.RENDERBUFFER, null);
	gl.bindFramebuffer(gl.FRAMEBUFFER, null);
	gl.activeTexture(gl.TEXTURE0);
	gl.bindTexture(gl.TEXTURE_2D, offscreenTex[0]);
	gl.activeTexture(gl.TEXTURE1);
	gl.bindTexture(gl.TEXTURE_2D, offscreenTex[1]);
	gl.activeTexture(gl.TEXTURE2);
	gl.bindTexture(gl.TEXTURE_2D, offscreenTex[2]);
	gl.activeTexture(gl.TEXTURE3);
	gl.bindTexture(gl.TEXTURE_2D, offscreenTex[3]);

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
	gl.clear(gl.COLOR_BUFFER_BIT);
	gl.flush();

	renderer.animate(clusteringScene);

	if (!cleanupIsSet) {
		console.log("Setup cleanup");
		context.cleanup.push([ offscreenFBO[0], offscreenFBO[1], 
			offscreenTex[0] ,offscreenTex[1], offscreenTex[2], offscreenTex[3], ],
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
		gl.vertexAttribPointer(prog.posCoord, 
			offsets.cloud.posCoord.size, gl.FLOAT, false, 
			offsets.cloud.bytestride, 
			offsets.cloud.posCoord.byteoffset);
		gl.drawElements(gl.POINTS, cloudSize, gl.UNSIGNED_INT, offsets.cloudindices.byteoffset);
	}

	prog = shaders.cluster;
	gl.useProgram(prog[GLNAME]);
	gl.vertexAttribPointer(prog.coord, 
		offsets.billboard.coord.size, gl.FLOAT, false, 
		offsets.billboard.bytestride, 
		offsets.billboard.coord.byteoffset);
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
	gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
	gl.uniform1i(prog.densityTex, fboIndex);
	gl.drawElements(gl.TRIANGLES, offsets.billboardindices.data.length, gl.UNSIGNED_INT, offsets.billboardindices.byteoffset);
	
	prog = shaders.points;
	gl.useProgram(prog[GLNAME]);
	gl.uniform1f(prog.pointSize, 1.0);
	gl.uniform1f(prog.fixedcolorFactor, 1.0);
	gl.vertexAttribPointer(prog.posCoord, 
		offsets.cloud.posCoord.size, gl.FLOAT, false, 
		offsets.cloud.bytestride, 
		offsets.cloud.posCoord.byteoffset);
	gl.drawElements(gl.POINTS, cloudSize, gl.UNSIGNED_INT, offsets.cloudindices.byteoffset);
	if (iterCount < fbosize) 
		renderer.animate(clusteringScene);
	else if (!geometryStage) {
		calcInitialClusters();	
	} else if (geometryStage) {
	}
}

let cloudCrossSections = [];
let geometryStage = false;

function calcInitialClusters () {
	const fbo = offscreenFBO[fboIndex];
	const w = fbo.width, h = fbo.height;
	gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
	const pixels = new Float32Array(fbo.width * fbo.height * 4)
	gl.readPixels(0, 0, fbo.width, fbo.height, gl.RGBA, gl.FLOAT, pixels);
	let clusterMap = Int32Array.from(pixels.filter((x,i)=>i%4===3));
	let clusterIDs = new Set ( clusterMap.filter( (x)=>x>0 ) );
	let xMinMax = clusterMap.reduce( (acc,x,i)=>{if (x>0) {const val=i%w; acc[0]=Math.min(acc[0],val); acc[1]=Math.max(acc[1],val)}; return acc} ,[+Infinity, -Infinity]);
	let yMinMax = clusterMap.reduce( (acc,x,i)=>{if (x>0) {const val=Math.floor(i/w); acc[0]=Math.min(acc[0],val); acc[1]=Math.max(acc[1],val)}; return acc} ,[+Infinity, -Infinity]);
	let xRange = xMinMax.map((x,i)=>(2*(x+i)-fbo.width)/fbo.width);
	let yRange = yMinMax.map((y,i)=>(2*(y+i)-fbo.height)/fbo.height);
	cloudCrossSections.push({
		deltaz: deltaZ,
		xrange: xRange, 
		yrange: yRange, 
		center: [(xRange[0]+xRange[1])/2, (yRange[0]+yRange[1])/2],
		numClusters: clusterIDs.size,
		baseScaler: 2.0/Math.max(
			(cloudMaxes[0]-cloudMids[0])*(xRange[1]-xRange[0]),
			(cloudMaxes[1]-cloudMids[1])*(yRange[1]-yRange[0])),
	});
	deltaZ+=0.1;
	if (deltaZ > cloudMaxes[2]) {
		geometryStage = true;
		perClusterAnalysis();
		return;
	} else {
		transMat = calcTransMat([cloudMids[0], cloudMids[1], deltaZ], initialScaler, zScaler);
		iterCount = 0;
		renderer.animate(clusteringScene);
	}
}

let crossSectIndex = 0;
function perClusterAnalysis() {
	const maxCrossSectionIndex = cloudCrossSections.length - 1;
	if (crossSectIndex > maxCrossSectionIndex) {
		drawTrunk();
		return;
	}
	crossSectIndex = (crossSectIndex < 0)? 0 : crossSectIndex;
	crossSectIndex = (crossSectIndex > maxCrossSectionIndex)? maxCrossSectionIndex : crossSectIndex;
	const cSect = cloudCrossSections[crossSectIndex];
	deltaZ = cSect.deltaz;
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

	bindfbo(0);
	bindprog(shaders.points);
	gl.uniformMatrix4fv(prog.MVPmatrix, false, mvpMat);
	gl.uniform1f(prog.pointSize, 1.0);
	gl.uniform1f(prog.fixedcolorFactor, 0.0);
	gl.clear(gl.COLOR_BUFFER_BIT);
	gl.vertexAttribPointer(prog.posCoord, 
		offsets.cloud.posCoord.size, gl.FLOAT, false, 
		offsets.cloud.bytestride, 
		offsets.cloud.posCoord.byteoffset);
	gl.drawElements(gl.POINTS, cloudSize, gl.UNSIGNED_INT, offsets.cloudindices.byteoffset);

	bindfbo(1);
	bindprog(shaders.cluster);
	gl.vertexAttribPointer(prog.coord, 
		offsets.billboard.coord.size, gl.FLOAT, false, 
		offsets.billboard.bytestride, 
		offsets.billboard.coord.byteoffset);
	gl.uniform1i(prog.occupancy, 0);
	gl.clear(gl.COLOR_BUFFER_BIT);
	gl.drawElements(gl.TRIANGLES, offsets.billboardindices.data.length, gl.UNSIGNED_INT, offsets.billboardindices.byteoffset);

	bindfbo(0);
	bindprog(shaders.geomcalc);
	gl.uniform1i(prog.occupancy, 1);
	gl.clear(gl.COLOR_BUFFER_BIT);
	gl.vertexAttribPointer(prog.coord, 
		offsets.billboard.coord.size, gl.FLOAT, false, 
		offsets.billboard.bytestride, 
		offsets.billboard.coord.byteoffset);
	gl.drawBuffers([
		gl.COLOR_ATTACHMENT0,
		gl.COLOR_ATTACHMENT1, 
	  ]);
	gl.drawElements(gl.TRIANGLES, offsets.billboardindices.data.length, gl.UNSIGNED_INT, offsets.billboardindices.byteoffset);
	gl.drawBuffers([
		gl.COLOR_ATTACHMENT0,
	  ]);

	gl.bindFramebuffer(gl.FRAMEBUFFER, null);
	gl.viewport (0.0, 0.0, gl.drawingBufferWidth, gl.drawingBufferHeight);
	gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
	bindprog(shaders.bill);
	gl.uniform1i(prog.densityTex, 0);
	gl.drawElements(gl.TRIANGLES, offsets.billboardindices.data.length, gl.UNSIGNED_INT, offsets.billboardindices.byteoffset);
	
	bindprog(shaders.points);
	gl.uniform1f(prog.pointSize, 2.0);
	gl.uniform1f(prog.fixedcolorFactor, 1.0);
	gl.vertexAttribPointer(prog.posCoord, 
		offsets.cloud.posCoord.size, gl.FLOAT, false, 
		offsets.cloud.bytestride, 
		offsets.cloud.posCoord.byteoffset);
	gl.drawElements(gl.POINTS, cloudSize, gl.UNSIGNED_INT, offsets.cloudindices.byteoffset);

	const w = fbo.width, h = fbo.height;
	gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
	const pixels = new Float32Array(fbo.width * fbo.height * 4)
	//gl.readBuffer(gl.COLOR_ATTACHMENT1);
	gl.readPixels(0, 0, fbo.width, fbo.height, gl.RGBA, gl.FLOAT, pixels);
	//gl.readBuffer(gl.COLOR_ATTACHMENT0);
	const clusterPixels = pixels.filter((x,i,a)=>a[i-i%4+3]>0);
	const centerX = 2*clusterPixels[1] - 1;
	const centerY = 2*clusterPixels[2] - 1;
	//console.log(`[ ${centerX}, ${centerY} ]`);
	cloudCrossSections[crossSectIndex].centerCorrect = [centerX, centerY];

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

function drawTrunk() {
	//let clusterNum = 1;
	let index = 0;
	let trunkCoords = [];
	while (index < cloudCrossSections.length) {
		const cSect = cloudCrossSections[index];
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
		}
		index++;
		//clusterNum=cloudCrossSections[index].numClusters;
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
	gl.uniform1f(program.pointSize, 3.0);
	gl.uniform1f(program.fixedcolorFactor, 1.0);
	gl.uniform3f(program.fixedColor, 0.0, 1.0, 0.0 );

	transMat = calcTransMat( [ cloudMids[0], cloudMids[1], cloudMids[2] ], initialScaler*0.33);

	renderer.animate(trunkScene);
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
	gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
	gl.vertexAttribPointer(program.posCoord, 
		offsets.cloud.posCoord.size, gl.FLOAT, false, 
		offsets.cloud.bytestride, 
		offsets.cloud.posCoord.byteoffset);
	gl.drawElements(gl.POINTS, cloudSize, gl.UNSIGNED_INT, offsets.cloudindices.byteoffset);

	program = shaders.points;
	gl.useProgram(program[GLNAME]);
	gl.uniformMatrix4fv(program.MVPmatrix, false, mvpMat);
	gl.vertexAttribPointer(program.posCoord, 
		offsets.trunk.posCoord.size, gl.FLOAT, false, 
		offsets.trunk.bytestride, 
		offsets.trunk.posCoord.byteoffset);
	gl.drawElements(gl.POINTS, offsets.trunkindices.data.length, gl.UNSIGNED_INT, offsets.trunkindices.byteoffset);
	gl.drawElements(gl.LINE_STRIP, offsets.trunkindices.data.length, gl.UNSIGNED_INT, offsets.trunkindices.byteoffset);

	renderer.animate(trunkScene);
}

function resizeCanvasCallback (e, projection) {
	//console.log("Resize event placeholder handler.");
}
