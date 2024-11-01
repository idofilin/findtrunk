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

in vec2 textureCoord;

out vec4 centroidData;

uniform sampler2D occupancy;
uniform float qstep;

void main(void)
{
	vec4 samp = texture( occupancy, textureCoord );
	if (samp.a < 0.5) 
		discard;
	
	int count=0;
	vec2 sum = vec2(0.0, 0.0);
	for (float sIndex = qstep/2.0; sIndex < 1.0; sIndex=sIndex+qstep)
	for (float tIndex = qstep/2.0; tIndex < 1.0; tIndex=tIndex+qstep) {
		vec4 tempSamp = texture( occupancy, vec2(sIndex,tIndex) );
		if (tempSamp.a > 0.5) {
			sum += vec2(sIndex, tIndex);
			count++;
		}
	}

	vec2 cntr = sum / float(count);
	float dist = distance(cntr,textureCoord);
	vec2 radiusVector = normalize(textureCoord - cntr);
	centroidData = vec4( dist, cntr.xy, radiusVector.y );
}

