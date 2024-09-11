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

async function batchLoad (sources, progressCallback, progressText) {
	const callback = getProgressCallback(progressCallback, progressText);
	const numResources = sources.size;
	const perResourcePromises = [];
	for (let [key,val] of sources) {
		perResourcePromises.push( fetch(key).then((res)=>resourceResolver(res,key,val)).catch(resourceResolver) );
	}
	let numPending = numResources;
	
	async function resourceResolver (response, source, alias) {
		let text = await response.text();
		numPending--;
		let aliases = alias &&
			( typeof alias == "string" && [alias]
				|| alias instanceof Array && alias ) 
			|| [] ; 
		let retval = {};
		aliases.forEach(function(x){typeof x == "string" && (retval[x] = text);});
		if (callback instanceof Function)
			callback((numResources - numPending)/numResources);
		return retval;
	}

	let shaderTexts = await Promise.all(perResourcePromises);
	return Object.assign.apply({},shaderTexts);

}

const progressClass = "progress-display-main",
	entryClass = "progress-display-entry",
	completedClass = "progress-display-completed";

class ProgressDisplay {
	constructor(options) {
		this.htmlElement = document.createElement("div");	
		this.htmlElement.classList.add(progressClass);
		this.subelements = [];
	} /* constructor */

	add (text) {
		const elm = document.createElement("div");
		elm.classList.add(entryClass);
		this.update(elm, text, 0);
		this.subelements.push(elm);
		this.htmlElement.appendChild(elm);
		return elm;
	}

	clear() {
		let progress=this;
		let elm;
		while (elm = progress.subelements.pop())
			progress.htmlElement.removeChild(elm);
	}

	update (elm, text, val) {
		elm.innerHTML = text + ": " + (val*100).toFixed(0) + "%";
		if (val >= 1.0) 
			elm.classList.add(completedClass);
	}
} /* class ProgressDisplay */

function getProgressCallback(callback, text) {
	let progressElement;
	if (callback instanceof Function) {
		return callback;
	} else if (callback instanceof ProgressDisplay) {
		progressElement = callback.add(text);
		return callback.update.bind(callback,progressElement,text);
	} 
}

export { batchLoad , ProgressDisplay }
