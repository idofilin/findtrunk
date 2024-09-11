/*
Copyright 2024 Ido Filin 

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import { GLNAME } from "./poikilo-core.js"
import {identity as identityTransform, sizeof} from "./poikilo-transforms.js"

class Renderer {
	constructor(options) {
		let _daycycle = {};
		Object.defineProperty(this, "dayCycle", {
			get: function() {return _daycycle},
			set: function(val){
				if (_daycycle.intervalID) clearInterval(_daycycle.intervalID);
				if (!val.callback || !(val.callback instanceof Function)) 
					_daycycle = {};
				else {
					_daycycle.callback = val.callback;
					_daycycle.callPeriod = val.callPeriod || 60000;
					_daycycle.intervalID = setInterval (
						function(){ _daycycle.callback(Date.now()) }
						, _daycycle.callPeriod );
				}
			}	
		});

		let _frameRequestID 
		Object.defineProperty(this, "frameRequestHandle", {
			get: function frameRequestHandle(){return _frameRequestID}, 
		});

		Object.defineProperty(this, "requestFrame", {
			value: ( !(window.requestAnimationFrame) ?
				function requestFrame(func){return _frameRequestID = setTimeout(function(){func.call(null,Date.now())},17)}
				: function requestFrame(func){return _frameRequestID = window.requestAnimationFrame(func)}),
			enumerable: true,
			configurable: false,
			writable: false,
		});

		const context = this.context,
			gl = context[GLNAME];
		this.vertexBuffer = gl.createBuffer();
		this.indexBuffer = gl.createBuffer();
		this.indexBytesize = (options && options.indexBytesize) || sizeof.uint16;

		let _vertexdata = {};
		Object.defineProperty(this, "vertexData", {
			get: function vertexData(){return _vertexdata}, 
		});
		
		let _resizer = null;
		Object.defineProperty(this, "resizer", {
			get: function getResizer() {return _resizer},
			set: function setResizer(val){
				window.removeEventListener("resize", _resizer, false);
				if (!(val instanceof Function)) 
					_resizer = null;
				else 
					_resizer = val;
				window.addEventListener("resize", _resizer, false);
			}	
		});

	} /* constructor */
	
	animate (func) {
		const context = this.context;
		if ( context.isContextLost && context.isContextLost() ) {
			this.cancelFrameRequest();
			context.clean();
			if (context.onContextLost && context.onContextLost instanceof Function)
				context.onContextLost();
			return -1;
		}
		return this.requestFrame(func);
	}

	addVertexData(name, data) {
		if (!this.vertexData) 
			return;
		const renderer = this,
			context = renderer.context,
			gl = context[GLNAME];
		const hiddenPropOptions = {configurable: false, writable: true, enumerable: false};
		let vertices = renderer.vertexData[name] = {};
		Object.defineProperties(vertices, { 
			data: hiddenPropOptions,
			bytesize: hiddenPropOptions,
			buffertype: hiddenPropOptions,
			byteoffset: hiddenPropOptions,
		});
		vertices.data = data.data;
		vertices.bytesize = data.bytesize;
		vertices.buffertype = vertices.byteoffset = 0;
		const buffertype = data.buffertype;
		if (!buffertype ||
				buffertype !== "index" && buffertype !== "element"
				&& buffertype !== "indices" && buffertype !== "elements") {
			let offset = 0;
			for (let ind = 0; ind < data.attributes.length; ind++) {
				const attribute = data.attributes[ind];
				for (const prop in attribute)
					if (attribute.hasOwnProperty(prop)) {
						const doffset = attribute[prop];
						vertices[prop] = {
							size: doffset,
							offset: offset, 
							bytesize: 0,
						};
						offset += doffset;
					};
			}
			Object.defineProperties(vertices, {
				"stride": hiddenPropOptions,
				"bytestride": hiddenPropOptions, 
			});
			vertices.bytestride = data.bytesize * (vertices.stride = offset);
		} else {
			vertices.buffertype = 1;
		}
	}

	updateBuffers () {
		const renderer = this,
			context = renderer.context,
			gl = context[GLNAME],
			vbuffer = renderer.vertexBuffer,
			ibuffer = renderer.indexBuffer,
			vertexData = renderer.vertexData,
			indexBytesize = renderer.indexBytesize;
		let offset = [0 , 0];
		for (const prop in vertexData) {
			if (vertexData.hasOwnProperty(prop)) {
				offset[vertexData[prop].buffertype] += vertexData[prop].data.length;
			}
		}
		let vrtxs = new Float32Array(offset[0]);
		let indxs = (indexBytesize===sizeof.uint32)? new Uint32Array(offset[1]) : new Uint16Array(offset[1]);

		offset = [0, 0];
		for (const prop in vertexData) {
			if (vertexData.hasOwnProperty(prop)) {
				const dataset = vertexData[prop];
				if (dataset.buffertype === 1)
					indxs.set(dataset.data, offset[1]);
				else
					vrtxs.set(dataset.data, offset[0]);
				dataset.byteoffset = offset[dataset.buffertype] * dataset.bytesize;
				if (dataset.buffertype === 0)
					for (const attribute in dataset) 
						if (dataset.hasOwnProperty(attribute)) 
							dataset[attribute].byteoffset = 
								(dataset[attribute].offset + offset[0])*dataset.bytesize;
				offset[dataset.buffertype] += dataset.data.length;
			}
		}
		gl.bindBuffer(gl.ARRAY_BUFFER, vbuffer);
		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibuffer);
		gl.bufferData(gl.ARRAY_BUFFER, vrtxs, gl.STATIC_DRAW);
		gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indxs, gl.STATIC_DRAW);
	}

	setDefaultResizer (callback) {
		const renderer = this,
			context = renderer.context,
			gl = context[GLNAME];
		renderer.resizer = function defaultResizer (e) {
			if (context.canvas.width != context.canvas.clientWidth 
					|| context.canvas.height != context.canvas.clientHeight
					|| e === true) {
				context.width = context.canvas.clientWidth;
				context.height = context.canvas.clientHeight;
				gl.viewport (0.0, 0.0, gl.drawingBufferWidth, gl.drawingBufferHeight);
				const projection = identityTransform();
				const ratio = context.aspect;
				projection[0] = (ratio < 1.0) ? ratio : 1.0;
				projection[5] = (ratio < 1.0) ? 1.0 : 1.0/ratio;
				if (callback instanceof Function)
					callback.call(null, e, projection);
			}
		}
	}

} /* class Renderer */

Renderer.prototype.cancelFrameRequest =
	(!window.requestAnimationFrame)?
		function cancelFrame(){clearTimeout(this.frameRequestHandle)}
		: function cancelFrame(){window.cancelAnimationFrame(this.frameRequestHandle)};

export { Renderer }
