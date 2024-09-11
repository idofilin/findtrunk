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

in vec4 spaceCoord;

out vec4 fragment_color;

const float SQRT2 = sqrt(2.0);

uniform float fixedcolorFactor;
uniform vec3 fixedColor;

void main(void)
{
	fragment_color = vec4(mix(0.5*spaceCoord.xyz+0.5, fixedColor, fixedcolorFactor), 1.0);

}
