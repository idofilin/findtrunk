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

import { GLNAME, Context as CoreContext, Shader, Program } from "./poikilo-core.js"

class Context extends CoreContext { 
	constructor (inputContext, options, subs=[]) {

		let gl;
		try {	
			let sendcontext = inputContext || document.createElement("canvas");	
			let contextParams = getContextParams(options);
			super(sendcontext, contextParams, subs);
			gl = this.gl;
		} catch(err) {
			throw "In context initilization:\n" + err;
		}

		let context=this;
		Object.defineProperties (context, {
			width: {
				get: function () { return this.canvas.clientWidth; },
				set: function (val) { this.canvas.width = val; },
			},
			height: {
				get: function () { return this.canvas.clientHeight; },
				set: function (val) { this.canvas.height = val; },
			},
			aspect: { 
				get: function () { return this.canvas.clientHeight/this.canvas.clientWidth; } 
			},
			isContextLost: {
				value : gl?.isContextLost instanceof Function && gl.isContextLost.bind(gl),
				enumerable : false,
				writable : false,
				configurable : false,
			},
		});

		if (options) {
			if (options.width) context.width = options.width;
			if (options.height) context.height = options.height;
			if (options.onContextLost) context.onContextLost = options.onContextLost; 
		}

		this.maxAttribs = gl.getParameter(gl.MAX_VERTEX_ATTRIBS);
		this.cleanup = [];
		window.addEventListener("beforeunload", this.clean.bind(this), true);
	} /* constructor */

	clean() {
		let context = this;
		let gl = context.gl;

		gl.useProgram(null);
		gl.bindTexture(gl.TEXTURE_2D,null);
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		gl.bindBuffer(gl.ARRAY_BUFFER, null);
		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);

		for (let cleanupObj of context.cleanup) {
			if (cleanupObj instanceof Function) 
				cleanupObj.call(context);
			else if (cleanupObj instanceof Object) {
				if (cleanupObj instanceof context.Renderer) {
					console.log("Canceling renderer frame");
					cleanupObj.cancelFrameRequest();
				}
				for (const prop in cleanupObj) {
					let focus = cleanupObj[prop]
					if (focus instanceof context.Program)
						gl.deleteProgram(focus[GLNAME]);
					else if (focus instanceof WebGLProgram) {
						console.log("Cleaning program "+prop);
						gl.deleteProgram(focus);
					}
					else if (focus instanceof context.Shader)
						gl.deleteShader(focus[GLNAME]);
					else if (focus instanceof WebGLShader)
						gl.deleteShader(focus);
					else if (focus instanceof context.Texture)
						gl.deleteTexture(focus[GLNAME]);
					else if (focus instanceof WebGLTexture)
						gl.deleteTexture(focus);
					else if (focus instanceof WebGLBuffer) {
						console.log("Cleaning buffer "+prop);
						gl.deleteBuffer(focus);
					} else 
						continue;
					delete cleanupObj[prop];
				}
				for (const prop in cleanupObj) { 
					if (cleanupObj[prop] instanceof WebGLFramebuffer) {
						gl.deleteFramebuffer(cleanupObj[prop]);
						delete cleanupObj[prop];
					} else if (cleanupObj[prop] instanceof WebGLRenderbuffer) {
						gl.deleteRenderbuffer(cleanupObj[prop]);
						delete cleanupObj[prop];
					}
				}
			}
		}
	} /* method clean */

}; /* class Context */

/* Helper functions. */
function getContextParams (options) {
	let contextParams = {
		alpha: (options && options.alpha!=undefined) ? options.alpha : false,
		"antialias": (options && options.antialias!=undefined) ? options.antialias : true,
	};
	return contextParams; 
};

/* Send load event */
let evt = new CustomEvent("poikilo-base-load"); 
window.dispatchEvent(evt);

export { Context, GLNAME, Shader, Program }
