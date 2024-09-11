/*
Copyright (C) 2024 Ido Filin. 

This GLSL code is free software; you can redistribute it
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

precision highp float;
#define PI 3.141592653589793238462643383279502884

in float zfactor;

out vec4 fragment_color;

const vec3 downcolor = vec3(112.0, 66.0, 20.0)/255.0;
const vec3 upcolor = vec3(0.0, 0.0, 1.0);

void main(void)
{
	vec3 mixedcolor = mix(downcolor, upcolor, smoothstep(0.2, 1.2, zfactor));
	//vec3 mixedcolor = mix(downcolor, upcolor, zfactor);
	fragment_color = vec4(mixedcolor, 0.25);
}
