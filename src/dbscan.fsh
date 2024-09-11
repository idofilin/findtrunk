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

#define SQRTHALF 0.7071068 

in vec2 textureCoord;

out vec4 fragment_color;

uniform sampler2D occupancy;
uniform float qstep;
const vec3 neighbors[8] = vec3[8](
	vec3(-1.0, -1.0, SQRTHALF),
	vec3( 0.0, -1.0, 1.0),
	vec3( 1.0, -1.0, SQRTHALF),
	vec3(-1.0,  0.0, 1.0),
	vec3( 1.0,  0.0, 1.0),
	vec3(-1.0,  1.0, SQRTHALF),
	vec3( 0.0,  1.0, 1.0),
	vec3( 1.0,  1.0, SQRTHALF)
);

const float EPS = 1.0e-8;

float coord2lex (in vec2 v) { 
	return floor(v.s/qstep) + floor(v.t/qstep)*floor(1.0/qstep);
}

vec2 lex2coord (in float f) { 
	float val = f*qstep;
	return vec2 ( fract(val), floor(val)*qstep );
}

void main(void)
{
	vec4 samp = texture( occupancy, textureCoord );
	if (samp.a < 0.5) 
		discard;

	float zVal = samp.b;
	vec2 gridPoint;
	vec4 neighborSamp;
	float clusterVal = coord2lex(textureCoord.st); 
	float connected = 0.0;
	vec2 xrange, yrange;
	if (samp.r <= 1.0) {
		xrange = textureCoord.ss;
    } else {
		xrange = lex2coord(samp.r);
	}
	if (samp.g <= 1.0) {
		yrange = textureCoord.tt;
    } else {
		yrange = lex2coord(samp.g);
	}	
	vec2 neighx, neighy;
	for (int i=0; i<8; i++) {
		gridPoint = textureCoord + qstep*neighbors[i].st;	
		neighborSamp = texture( occupancy, gridPoint);
		if (neighborSamp.a > 0.5) {
			clusterVal = max(clusterVal, neighborSamp.a);
			if (neighborSamp.r <= 1.0) {
				neighx = gridPoint.ss;
			} else {
				neighx = lex2coord(neighborSamp.r);
			}
			if (neighborSamp.g <= 1.0) {
				neighy = gridPoint.tt;
			} else {
				neighy = lex2coord(neighborSamp.g);
			}	
			xrange.x = min(xrange.x, neighx.x);
			xrange.y = max(xrange.y, neighx.y);
			yrange.x = min(yrange.x, neighy.x);
			yrange.y = max(yrange.y, neighy.y);
		}
		connected = max(connected, neighborSamp.a);
	}

	if (connected < 0.5) 
		discard;

	fragment_color = vec4( coord2lex(xrange), coord2lex(yrange), zVal, clusterVal );
}

