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

const TypedArray = Uint8Array.prototype.__proto__.constructor;

class Texture { 
	constructor (source, options) {
		const textureObj = this,
			context = textureObj.context,
			gl = context[GLNAME];
		const tex = gl.createTexture(); 
		const texopts = context.Texture.options(options, source); 
		const format = texopts.format,
			informat = texopts.informat,
			wrap = texopts.wrap,
			texTarget = texopts.target,
			magfilter = texopts.magfilter,
			minfilter = texopts.minfilter,
			width = texopts.width,
			height = texopts.height,
			datumtype = texopts.type;

		gl.bindTexture(texTarget, tex);

		if (typeof source ===  "string" || source instanceof Blob) {
			let texImg = new Image();
			texImg.onload = function (e) {
				e.stopPropagation();
				e.target.onload = null;
				const currTex = gl.getParameter(gl.TEXTURE_BINDING_2D);
				gl.bindTexture(gl.TEXTURE_2D, tex);
				gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
				gl.texImage2D(gl.TEXTURE_2D, 0, informat, format, gl.UNSIGNED_BYTE, e.target);
				initTextureParameters(tex);
				if (options && options.callback instanceof Function)
					options.callback.call({tex:tex, source:source}, options);
				gl.bindTexture(gl.TEXTURE_2D, currTex);
			}
			texImg.src = 
				(source instanceof Blob) && window.URL.createObjectURL(source) 
				|| source;

		} else if (source instanceof WebGLFramebuffer) {
			const fbo = source;
			const attachment = options && options.attachment || gl.COLOR_ATTACHMENT0;
			gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
			gl.bindTexture(gl.TEXTURE_2D, tex);
			gl.texImage2D(gl.TEXTURE_2D, 0, informat, 
					width, height, 0, format, datumtype, null);
			initTextureParameters(tex);
			gl.framebufferTexture2D(gl.FRAMEBUFFER, attachment, gl.TEXTURE_2D, tex, 0);

		} else if (source instanceof ImageData) {
			gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
			gl.texImage2D(gl.TEXTURE_2D, 0, informat, format, gl.UNSIGNED_BYTE, source);
			initTextureParameters(tex);

		} else if (texTarget == gl.TEXTURE_2D && source instanceof TypedArray) {
			const pixels = source;
			gl.texImage2D(gl.TEXTURE_2D, 0, informat, 
					width, height, 0, format, datumtype, pixels);
			initTextureParameters(tex);

		} else if (texTarget == gl.TEXTURE_3D && source instanceof TypedArray) {
			const pixels = source;
			const depth = texopts.depth;
			gl.texImage3D(gl.TEXTURE_3D, 0, informat, 
					width, height, depth, 0, format, datumtype, pixels);
			initTextureParameters(tex);

		} else if (source instanceof Array 
					&& source.length == 2 
					&& typeof source[0] === "number"
					&& typeof source[1] === "number") {
			if (texTarget == gl.TEXTURE_3D) {
				let depth = texopts.depth;
				gl.texStorage3D(gl.TEXTURE_3D, 1, gl.RGBA8, width, height, depth); 
				gl.copyTexSubImage3D(gl.TEXTURE_3D, 0, 0, 0, 0,
					source[0], source[1], width, height);
			} else {
				gl.copyTexImage2D(gl.TEXTURE_2D, 0, format, 
					source[0], source[1], width, height, 0);
			}
			initTextureParameters(tex);

		} 

		function initTextureParameters(tex) {
			if ( !gl.isTexture(tex) ) {
				console.error("Error: texture for " + source + " is invalid.\n");
				return;
			} 
			gl.texParameteri(texTarget, gl.TEXTURE_WRAP_S, wrap);
			gl.texParameteri(texTarget, gl.TEXTURE_WRAP_T, wrap);
			gl.texParameteri(texTarget, gl.TEXTURE_WRAP_R, wrap);
			gl.texParameteri(texTarget, gl.TEXTURE_MAG_FILTER, magfilter);
			gl.texParameteri(texTarget, gl.TEXTURE_MIN_FILTER, minfilter);
			if (minfilter == gl.LINEAR_MIPMAP_LINEAR 
					|| minfilter == gl.NEAREST_MIPMAP_NEAREST
					|| minfilter == gl.LINEAR_MIPMAP_NEAREST
					|| minfilter == gl.NEAREST_MIPMAP_LINEAR ) {
				gl.generateMipmap(texTarget);
			}
		}

		this[GLNAME] = tex;
	} /* constructor */;

} /* class Texture */

Texture.init = function textureInit (context, {src, options, ...rest}, callback) {
		let sendoptions = options && Object.create(options) || rest;
		sendoptions.callback = callback;
		return (new context.Texture(src, sendoptions));
	}

Texture.options = function textureOptions (context, options, source) {
		const gl = context[GLNAME]; 
		let opts = { 
			name : options && typeof options.name === "string" && options.name || false,
			format: options && options.format || options.informat || gl.RGBA,
			informat: options && options.informat || options.internalformat || options.format || gl.RGBA,
			type: options && options.type || gl.UNSIGNED_BYTE,
			magfilter:options && (options.magfilter || options.filter) || gl.LINEAR, 
			minfilter:options && (options.minfilter || options.filter) || gl.LINEAR_MIPMAP_LINEAR,
			filter: options && options.filter || null, 
			width: (options && options.width) || (source && source.width) || 256,
			height: (options && options.height) || (source && source.height) || 256,
			depth: (options && options.depth) || (source && source.depth) || 256,
			wrap: options && options.wrap || gl.CLAMP_TO_EDGE,
			target: (options && (options.target === "3d" || options.target === "3D") && gl.TEXTURE_3D) 
				|| (options && options.target) 
				|| gl.TEXTURE_2D,
		};
		return opts;
	}


export { Texture }
