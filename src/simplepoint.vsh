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

in vec3 posCoord;

out vec4 spaceCoord;

uniform mat4 MVPmatrix;
uniform float pointSize;

void main()
{
	gl_Position =  spaceCoord = MVPmatrix * vec4(posCoord, 1.0);
	gl_PointSize = pointSize;
}
