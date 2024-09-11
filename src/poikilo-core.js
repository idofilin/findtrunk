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

const GLNAME = "gl"

class Context {
	constructor (inputContext, contextParams, subconstructors=[]) {
		let gl, canvas;
		try {
			if (inputContext instanceof WebGL2RenderingContext) {
				gl = inputContext;
				canvas = gl.canvas;
			} else if  (inputContext instanceof HTMLCanvasElement) {
				canvas = inputContext;
				gl = canvas.getContext("webgl2", contextParams);
				if (!gl)
					throw "Failed to get WebGL2 context.\n" 
						+ "Your browser or operating system may not support WebGL2.\n";
			} else {
				throw "Input to context constructor must be instance of HTMLCanvasElement or WebGL2RenderingContext."
			}
		} catch(err) {
			throw "In context initialization:\n" + err;
		}

		this[GLNAME] = gl;
		this.canvas = canvas;
		this.subconstructors = [];

		let context = this;
		for(const method of subconstructors) {
			if (!(method instanceof Function && method.name))
				return;
			let proto = Object.create(method.prototype);
			let subconstructor = function subconstructor(...args){ return Reflect.construct(method,  args, subconstructor) };
			subconstructor.prototype = proto;
			subconstructor.prototype.constructor = subconstructor;
			Object.defineProperty(subconstructor, "name",
				{value:method.name, writable:false, configurable:false});
			Object.defineProperty(subconstructor.prototype,"context", 
				{value:context, writable:false, configurable:false});
			context[method.name] = subconstructor;
			for (const utility in method) 
				subconstructor[utility] = 
					method[utility] instanceof Function && method[utility].bind(null, context)
					|| method[utility];
			context.subconstructors.push(subconstructor);
		};
	}
}

const explicitVersionRE = /^\s*(#version)/m;
const versionSniffRE= /^\s*(attribute|varying)/m;

class Shader { 
	constructor (type, source) {
		let context = this.context,
			gl = context && context[GLNAME];
		if (!context || !gl) {
			throw "Unable to get context when creating shader.\n" + source;
		}

		let shaderType = type;
		if (typeof type === "string") 
			shaderType = 
				(type === "VERTEX_SHADER" || type === "FRAGMENT_SHADER") && gl[type]
				|| type.toLowerCase() === "vertex" && gl.VERTEX_SHADER 
				|| type.toLowerCase() === "fragment" && gl.FRAGMENT_SHADER;
		if (!shaderType || shaderType !== gl.VERTEX_SHADER && shaderType != gl.FRAGMENT_SHADER ) {
			throw "Invalid shader type " + type + ", when creating shader.\n" + source;
		}

		let shader = gl.createShader(shaderType);
		if (!shader) {
			throw "Failed to create new WebGLShader object.\n" + source;
		}

		let compileSource = Shader.getVersionString(source) + source;
		gl.shaderSource(shader, compileSource);
		gl.compileShader(shader);
		if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
			const errLog = gl.getShaderInfoLog(shader);
			gl.deleteShader(shader);
			throw compileSource.split('\n')
					.reduce(function(acc,x,i){
						return acc + (i+1) + " " + x + "\n"}, "\n")
				+ "\nFailed to compile shader." 
				+ "\nError log:\n" + errLog;
		}

		this.type = shaderType;
		this.source = compileSource;
		this[GLNAME] = shader;
	} /* constructor */

	static getVersionString (source) {
		let version;
		 if ( explicitVersionRE.test(source) ) 
			 version="";
		else if ( versionSniffRE.test(source) ) 
			version = "#version 100\r\n";
		else
			version = "#version 300 es\r\n";
		return version;
	}
};

const uniformRE = /^\s*uniform\s+((highp|lowp|mediump)\s+)?(float|int|vec2|vec3|vec4|mat2|mat3|mat4|sampler2D|sampler3D)\s+(\w*)(?:\[\d+\])?\s*;/mg;
const attributeRE = /^\s*(attribute|in|IN)\s+((highp|lowp|mediump)\s+)?(float|vec2|vec3|vec4)\s+(\w*)\s*;/mg;

class Program { 
	constructor (vshader, fshader) {
		let context = this.context,
			gl = context && context[GLNAME];
		if (!context || !gl) {
			throw "Unable to get context when creating shader program.\n";
		}

		let programShaders = [
			{ref: vshader, owned: false}, 
			{ref: fshader, owned: false}
		];
		try { 
			programShaders.forEach(function(shader, index) {
				if (shader.ref instanceof context.Shader) {
					return;
				} else if (typeof shader.ref === "string") {
					shader.ref = 
						new context.Shader( 
							(index == 0) ? gl.VERTEX_SHADER : gl.FRAGMENT_SHADER, 
							shader.ref);
					shader.owned = true;
				} else {
					throw "When building shader program, " 
						+ ((index == 0) ? "vertex" : "fragment") 
						+ " shader is of invalid type.";
				}
			});
		} catch (err) {
			cleanup();
			throw err;
		}
		
		let program = gl.createProgram();
		if (!program) {
			cleanup();
			throw "Failed to create new WebGLProgram object.";
		}
		
		let programDeleted;
		try {
			gl.attachShader(program, programShaders[0].ref[GLNAME]);
			gl.attachShader(program, programShaders[1].ref[GLNAME]);
			gl.linkProgram(program);
			if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
				const linkErrLog = gl.getProgramInfoLog(program);
				throw "Shader program did not link successfully.\nError log:\n" + linkErrLog;
			} else {
				this[GLNAME] = program;
				this.vertexShaderSource = programShaders[0].ref.source;
				this.fragmentShaderSource = programShaders[1].ref.source;
				Program.getAttributesAndUniforms(this);
			}
		} catch (err) {
			gl.deleteProgram(program);
			programDeleted = true;
			throw (err);
		} finally {
			if (!programDeleted) {
				gl.detachShader(program, programShaders[0].ref[GLNAME]);
				gl.detachShader(program, programShaders[1].ref[GLNAME]);
			}
			cleanup();
		}

		function cleanup() {
			if (programShaders[0].owned)
				gl.deleteShader(programShaders[0].ref[GLNAME]);
			if (programShaders[1].owned)
				gl.deleteShader(programShaders[1].ref[GLNAME]);
		}
	} /* constructor */ 

	static getAttributesAndUniforms (inprogram) {
		const program = inprogram,
			context = program.context, 
			gl = context[GLNAME],
			vsource = program.vertexShaderSource,
			fsource = program.fragmentShaderSource;

		let match, attr, unif;
		while (match = attributeRE.exec(vsource)) {
			attr = match.splice(-1)[0];
			if (!program[attr]) {
				program[attr] = gl.getAttribLocation(program[GLNAME], attr);
				if (program[attr] >= 0)
					gl.enableVertexAttribArray(program[attr]);
			}
		}
		while (match = uniformRE.exec(vsource+"\n"+fsource)) {
			unif = match.splice(-1)[0];
			if (!program[unif]) 
				program[unif] = gl.getUniformLocation(program[GLNAME], unif);
		}
	} /* getAttributesAndUniforms */
} /* class Program */

export { GLNAME, Context, Shader, Program };
