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

import { ProgressDisplay } from "./kangas.js/load.js"

async function load (filename, progress) {
	let progdisp = progress instanceof ProgressDisplay && progress || undefined ;
	let elm = progdisp?.add("Loading point cloud");

	let response = await fetch(filename)
	progdisp?.update(elm, "Loading point cloud", 0.5);

	let body = await response.text();
	progdisp?.update(elm, "Loading point cloud", 0.6);

	let numberPoints = body.trim().split(/\s+/).map(Number);
	progdisp?.update(elm, "Loading point cloud", 0.7);

	let points = Float32Array.from(numberPoints);
	progdisp?.update(elm, "Loading point cloud", 0.8);

	let cloudStats = calcStats(numberPoints,3);
	progdisp?.update(elm, "Loading point cloud", 0.9);
	progdisp?.update(elm, "Loading point cloud", 1.0);

	return Object.assign( { data:points }, cloudStats );
}

function transform (delta, scaler, scalerz = scaler) { 
	return Float32Array.from([
	scaler, 0, 0, 0,
	0.0, scaler, 0, 0,
	0.0, 0.0, scalerz, 0,
	-delta[0]*scaler, -delta[1]*scaler, -delta[2]*scalerz, 1.0 
]);}

function calcStats(data, stride = 1) {
	let datasize = data.length;
	let datalen = Math.floor(datasize/stride);
	let Sums = data.reduce( 
		(a,x,i) =>{a[i%stride]+=x; return a}, 
		Array(stride).fill(0) ) 
	let Maxes = data.reduce( 
		(a,x,i) =>{a[i%stride]=Math.max(x,a[i%stride]); return a}, 
		Array(stride).fill(-Infinity) ) 
	let Mins = data.reduce( 
		(a,x,i) =>{a[i%stride]=Math.min(x,a[i%stride]); return a}, 
		Array(stride).fill(+Infinity) ) 
	let Means = Sums.map((x)=>x/datalen);
	let VARs = data.reduce( 
		(a,x,i) =>{a[i%stride]+=(x-Means[i%stride])**2/(datalen - 1); return a},
		Array(stride).fill(0) ); 
	return { 
		size: datalen, datasize: datasize, stride: stride, 
		sum: Sums, max: Maxes, min: Mins, mean: Means, 
		"var":VARs, sd: VARs.map(Math.sqrt),
	};
}


function calcSlices (data, delta, stride = 1, offset = stride - 1) {
	let datasize = data.length;
	let datalen = Math.floor(datasize/stride);
	let startindex = offset,
		minval = data[startindex],
		currval;
	let slices = [];
	for (let i = offset; i < datasize; i+=stride) {
		currval = data[i];
		if ( (currval-minval) <= delta ) 
			continue; 
		let theslice = {
			min: minval,
			max: currval,
			mid: (currval+minval)/2,
			start: (startindex - offset),
			end: (i + stride - 1 - offset),
			get startelement(){return (this.start/stride)},
			get endelement(){return ((this.end+1)/stride-1)},
		};
		slices.push(theslice);
		minval = currval;
		startindex = i;
	}
	return slices; 
}




const cloudFilenames = [
"FSYL1.asc",
"FSYL2.asc",
"FSYL3.asc",
"FSYL4.asc",
"FSYL5.asc",
"FSYL6.asc",
"FSYL7.asc",
"FSYL8.asc",
"FSYL9.asc",
"FSYL10.asc",
"FSYL11.asc",
"FSYL12.asc",
"FSYL13.asc",
"FSYL14.asc",
"FSYL15.asc",
"PSYLA1.asc",
"PSYLA2.asc",
"PSYLA3.asc",
"PSYLA4.asc",
"PSYLA5.asc",
"PSYLA6.asc",
"PSYLA7.asc",
"PSYLA8.asc",
"PSYLA9.asc",
"PSYLA10.asc",
"PSYLA11.asc",
"PSYLA12.asc",
"PSYLA13.asc",
"PSYLA14.asc",
"PSYLA15.asc",
"FEXC1.asc",
"FEXC2.asc",
"FEXC3.asc",
"FEXC4.asc",
"FEXC5.asc",
"FEXC6.asc",
"FEXC7.asc",
"FEXC8.asc",
"FEXC9.asc",
"FEXC10.asc",
"FEXC11.asc",
"FEXC12.asc",
"FEXC13.asc",
"FEXC14.asc",
"FEXC15.asc",
"FEXC16.asc",
"LXDC1.asc",
"LXDC2.asc",
"LXDC3.asc",
"LXDC4.asc",
"LXDC5.asc",
"PSYLB1.asc",
"PSYLB2.asc",
"PSYLB3.asc",
"PSYLB4.asc",
"PSYLB5.asc",
"PSYLB6.asc",
"PSYLB7.asc",
"PSYLB8.asc",
"PSYLB9.asc",
"PSYLB10.asc",
"PSYLB11.asc",
"PSYLB12.asc",
"PSYLB13.asc",
"PSYLB14.asc",
"PSYLB15.asc",
];

export { load , transform, calcStats, calcSlices, cloudFilenames };
