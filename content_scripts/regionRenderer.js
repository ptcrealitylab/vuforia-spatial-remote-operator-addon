/*
* Copyright © 2018 PTC
*
* This Source Code Form is subject to the terms of the Mozilla Public
* License, v. 2.0. If a copy of the MPL was not distributed with this
* file, You can obtain one at http://mozilla.org/MPL/2.0/.
*/

createNameSpace('realityEditor.regionRenderer');

(function(exports) {

    let rgbInactive = {
        r: 1,
        g: 255,
        b: 252
    };
    let rgbActive = {
        r: 0,
        g: 255,
        b: 0
    };

    let svg = null;

    function initService() {
        if (!realityEditor.device.desktopAdapter.isDesktop()) { return; }
    }

    function calculateConvexHull(imageData, size, colorHex, concavity) {
        let hullPoints = [];

        let tolerance = 10;
        const stride = 4;

        let rgb = hexToRgbA(colorHex);

        for (let i = 0; i < imageData.length; i += stride) {
            let x = Math.floor((i % (size * stride)) / stride);
            let y = Math.floor(i / (size * stride));

            let dr = Math.abs(imageData[i] - rgb.r);
            let dg = Math.abs(imageData[i+1] - rgb.g);
            let db = Math.abs(imageData[i+2] - rgb.b);

            if (dr < tolerance && dg <= tolerance && db <= tolerance && imageData[i+3] === 255) {
                hullPoints.push([x, y]);
            }
        }

        // return hullPoints;
        // drawHulls(svg, hullPoints, Infinity);

        return hull(hullPoints, concavity || Infinity);
    }

    function hexToRgbA(hex){
        var c;
        if(/^#([A-Fa-f0-9]{3}){1,2}$/.test(hex)){
            c= hex.substring(1).split('');
            if(c.length === 3){
                c= [c[0], c[0], c[1], c[1], c[2], c[2]];
            }
            c= '0x'+c.join('');
            // return 'rgba('+[(c>>16)&255, (c>>8)&255, c&255].join(',')+',1)';
            return {
                r: (c>>16)&255,
                g: (c>>8)&255,
                b: c&255
            }
        }
        throw new Error('Bad Hex');
    }

    // console.log(hexToRgbA("#60fa21"));

    function clearHulls(svg) {
        while (svg.lastChild) {
            svg.removeChild(svg.firstChild);
        }
    }

    function drawHull(hullShape, size) {
        if (hullShape.length === 0) {
            return;
        }

        if (!svg) {
            createSVG(size);
        }

        // create hull points
        // hullShape = hull(hullPoints, concavity);
        var hullString = '';
        hullShape.forEach(function(pt) {
            hullString += ' ' + pt[0] + ', ' + pt[1];
        });
        hullString += ' ' + hullShape[0][0] + ', ' + hullShape[0][1];

        // draw hull
        var hullSVG = document.createElementNS(svg.namespaceURI, 'polyline');
        if (hullString.indexOf("undefined") === -1) {
            hullSVG.setAttribute("points", hullString);
            hullSVG.setAttribute("fill", 'rgba('+rgbInactive.r+','+rgbInactive.g+','+rgbInactive.b+',0.5)');
            hullSVG.classList.add('hullContents');
            hullSVG.setAttribute("stroke", "#FFF");
            hullSVG.setAttribute("stroke-width", "5");
            hullSVG.classList.add("hull");
            svg.appendChild(hullSVG);
        }
    }

    // function drawHull3D(worldCoordinates) {
    //     const THREE = realityEditor.gui.threejsScene.THREE;
    //
    // }

    function createSVG(size) {
        svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        // svg.setAttribute('style', 'border: 1px solid black');
        svg.setAttribute('width', size.toString());
        svg.setAttribute('height', size.toString());
        svg.setAttributeNS("http://www.w3.org/2000/xmlns/", "xmlns:xlink", "http://www.w3.org/1999/xlink");
        document.body.appendChild(svg);
        svg.id = 'hullSVG';

        // let svg = document.getElementById('hullSVG');
        svg.style.width = size + 'px';
        svg.style.height = size + 'px';
        svg.style.position = 'absolute';
        svg.style.left = '0';
        svg.style.top = '0';
        svg.style.backgroundColor = 'rgb(200, 200, 200)';
        svg.style.opacity = '0.8';
    }

    // function checkPoint(x, y, hull) {
    //     let isInAnyTriangle = false;
    //     let pt0 = hull[0];
    //     for (let i = 1; i < hull.length - 1; i++) {
    //         let pt1 = hull[i];
    //         let pt2 = hull[i+1];
    //
    //         // check if x,y is within the triangle [pt0, pt1, pt2]
    //         if (isPointWithinTriangle(x, y, pt0[0], pt0[1], pt1[0], pt1[1], pt2[0], pt2[1])) {
    //             isInAnyTriangle = true;
    //         }
    //     }
    //     return isInAnyTriangle;
    // }
    //
    // function isPointWithinTriangle(x, y, x1, y1, x2, y2, x3, y3) {
    //     /* Calculate area of triangle ABC */
    //     let A = triangleArea (x1, y1, x2, y2, x3, y3);
    //
    //     /* Calculate area of triangle PBC */
    //     let A1 = triangleArea (x, y, x2, y2, x3, y3);
    //
    //     /* Calculate area of triangle PAC */
    //     let A2 = triangleArea (x1, y1, x, y, x3, y3);
    //
    //     /* Calculate area of triangle PAB */
    //     let A3 = triangleArea (x1, y1, x2, y2, x, y);
    //
    //     /* Check if sum of A1, A2 and A3 is same as A */
    //     return (A === A1 + A2 + A3);
    // }
    //
    // function triangleArea(x1, y1, x2, y2, x3, y3) {
    //     return Math.abs((x1*(y2-y3) + x2*(y3-y1)+ x3*(y1-y2))/2.0);
    // }

    // uses the even-odd rule (https://en.wikipedia.org/wiki/Even–odd_rule) to check if a point is inside the shape
    // casts a ray horizontally to the right from this point and counts number of segment intersections
    function checkPointConcave(x, y, hull) {
        let evenOddCounter = 0;
        for (let i = 0; i < hull.length; i++) {
            let x1 = hull[i][0];
            let y1 = hull[i][1];
            let x2, y2;
            if (i+1 < hull.length) {
                x2 = hull[i+1][0];
                y2 = hull[i+1][1];
            } else {
                x2 = hull[0][0]; // edge case for last segment
                y2 = hull[0][1];
            }


            if (x1 < x && x2 < x) {
                continue;
            }

            if (y1 < y && y2 > y || y1 > y && y2 < y) {
                evenOddCounter += 1; // intersection between horizontal ray and segment
            }
        }

        return evenOddCounter % 2 === 1;
    }

    exports.calculateConvexHull = calculateConvexHull;
    exports.drawHull = drawHull;
    // exports.drawHull3D = drawHull3D;
    exports.checkPointConcave = checkPointConcave;

    realityEditor.addons.addCallback('init', initService);
})(realityEditor.regionRenderer);
