import React, { useEffect } from 'react';
import {Link, useLocation, useNavigate} from 'react-router-dom'
import { CiLogin, CiMoneyBill } from "react-icons/ci";
import { RiVideoUploadLine } from "react-icons/ri";
import { IoAddOutline } from "react-icons/io5";
import { GoUpload, GoDownload } from "react-icons/go";
import './MenuBar.css';  // Import the CSS for styling

const MenuBar = () => {

    const location = useLocation();
    const navigate = useNavigate();

    useEffect(() => {
        if (localStorage.getItem('token') === null && location.pathname !== "/login") {
            navigate("/login");
        }
    }, [])

    if (location.pathname === "/login" || location.pathname === "/register") {
        return null
    }

    return (
        <div className='menu'>
            <Link to='/'> <img src="/PeerPlay_logo.png" alt="PeerPlay Logo" className="logo" /> </Link>
            <div className='menu-options'>
                <Link to="/retrieve" className='menu-option'><GoDownload className='icon'/></Link>
            </div>
            <div className="menu-options">
                <Link to="/video" className='menu-option'><IoAddOutline className='icon'/></Link>
            </div>
            <div className="menu-options">
                <Link to="/video" className='menu-option'><CiMoneyBill className='icon'/></Link>
            </div>
            <div className='menu-options'>
                <Link to="/login" className='menu-option'><CiLogin className='icon'/></Link>
            </div>
        </div>
    );
};

export default MenuBar;
